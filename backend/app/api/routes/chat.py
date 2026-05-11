"""
chat.py (route) — Chat IA com 3 modos de operação

POST   /api/v1/chat              → enviar mensagem (cria sessão se necessário)
POST   /api/v1/chat/stream       → enviar mensagem com resposta streaming (SSE)
GET    /api/v1/chat/{session_id} → histórico da sessão
DELETE /api/v1/chat/{session_id} → encerrar sessão
"""

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser
from app.models.chat_session import ChatSession
from app.repositories.checklist import ChecklistRepository
from app.repositories.term import TermRepository
from app.repositories.workflow_event import WorkflowEventRepository
from app.schemas.chat import ChatRequest, ChatFinalizeResponse, ChatResponse, ChatSessionResponse, ChatMessage
from app.services.ai_chat import AIChatService, AINotConfiguredError, AIProviderError
from app.utils.exceptions import ChatSessionNotFoundError
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat IA"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=ChatResponse)
async def send_message(payload: ChatRequest, db: DbDep, current_user: CurrentUser):
    """
    Envia uma mensagem ao assistente IA (HU-02).

    Fluxo:
      - Se session_id não fornecido: cria nova sessão com system prompt
      - Se session_id fornecido: continua sessão existente
      - Chama o provedor de IA configurado com histórico completo
      - Salva a nova mensagem no histórico
      - Se modo 'gerar' e TR completo detectado: salva TR automaticamente
    """
    # --- Carrega ou cria sessão ---
    session = await _get_or_create_session(db, payload.session_id, payload.mode)

    # --- Prepara histórico para a IA ---
    history = [m for m in session.messages if m.get("role") != "system"]

    # --- Chama o serviço de IA ---
    try:
        ai_result = await AIChatService.process_message(
            message=payload.message,
            mode=session.mode,
            history=history,
        )
    except AINotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except AIProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # --- Atualiza histórico na sessão ---
    session.add_message("user", payload.message)
    session.add_message("assistant", ai_result["content"])
    await db.flush()

    # --- Se TR foi gerado, salva-o ---
    generated_term_id = None
    if ai_result.get("term_complete") and session.mode == "gerar":
        generated_term_id = await _persist_term_from_session(db, session, current_user)
        logger.info("TR gerado via chat: term_id=%s session_id=%s", generated_term_id, session.id)

    return ChatResponse(
        message=ai_result["content"],
        session_id=str(session.id),
        mode=session.mode,
        generated_term_id=generated_term_id,
    )


@router.post("/stream")
async def stream_message(payload: ChatRequest, db: DbDep, current_user: CurrentUser):
    """
    Envia uma mensagem com resposta streaming via SSE.

    O frontend recebe tokens incrementalmente. O último evento SSE é um JSON
    com metadados: {"done": true, "term_complete": bool}.
    Após o stream, o histórico é salvo normalmente.
    """
    session = await _get_or_create_session(db, payload.session_id, payload.mode)
    history = [m for m in session.messages if m.get("role") != "system"]

    try:
        AIChatService._ensure_configured()
    except AINotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def event_generator():
        full_content = ""
        term_complete = False

        async for chunk in AIChatService.stream_message(
            message=payload.message,
            mode=session.mode,
            history=history,
        ):
            # Tenta parsear como JSON de metadados (último chunk)
            try:
                meta = json.loads(chunk)
                if isinstance(meta, dict) and meta.get("done"):
                    term_complete = meta.get("term_complete", False)
                    continue
            except (json.JSONDecodeError, TypeError):
                pass

            full_content += chunk
            yield f"data: {json.dumps({'token': chunk})}\n\n"

        # Salva no histórico
        session.add_message("user", payload.message)
        session.add_message("assistant", full_content)
        await db.flush()

        # Salva TR se gerado
        generated_term_id = None
        if term_complete and session.mode == "gerar":
            generated_term_id = await _persist_term_from_session(db, session, current_user)
            logger.info("TR gerado via stream: term_id=%s session_id=%s", generated_term_id, session.id)

        # Evento final com metadados
        yield f"data: {json.dumps({'done': True, 'session_id': str(session.id), 'mode': session.mode, 'generated_term_id': generated_term_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/finalize", response_model=ChatFinalizeResponse)
async def finalize_session(session_id: str, db: DbDep, current_user: CurrentUser):
    """
    Finaliza explicitamente uma sessão de chat, criando o TR a partir do último
    conteúdo gerado pelo assistente (HU-02).

    Idempotente: se o TR já foi criado anteriormente, retorna o mesmo term_id
    sem criar duplicatas.
    """
    session = await _find_session(db, session_id)

    # --- Idempotência: TR já existe ---
    if session.generated_term_id:
        return ChatFinalizeResponse(term_id=str(session.generated_term_id))

    # --- Cria o TR a partir do conteúdo da sessão ---
    term_id = await _persist_term_from_session(db, session, current_user)
    logger.info("Sessão finalizada manualmente: term_id=%s session_id=%s", term_id, session_id)
    return ChatFinalizeResponse(term_id=term_id)


@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_session(session_id: str, db: DbDep, current_user: CurrentUser):
    """Recupera o histórico completo de uma sessão de chat."""
    session = await _find_session(db, session_id)
    return ChatSessionResponse(
        id=str(session.id),
        mode=session.mode,
        messages=[
            ChatMessage(role=m["role"], content=m["content"])
            for m in session.messages
            if m.get("role") in ("user", "assistant")
        ],
        generated_term_id=str(session.generated_term_id) if session.generated_term_id else None,
        message_count=session.message_count,
        created_at=str(session.created_at),
        updated_at=str(session.updated_at),
    )


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str, db: DbDep, current_user: CurrentUser):
    """Encerra e remove uma sessão de chat."""
    session = await _find_session(db, session_id)
    await db.delete(session)
    await db.flush()


# ------------------------------------------------------------------ #
# Utilitários internos
# ------------------------------------------------------------------ #

async def _persist_term_from_session(
    db: AsyncSession,
    session: ChatSession,
    current_user,
) -> str:
    """
    Cria um TR a partir do conteúdo da sessão de chat.

    Extrai o último conteúdo do assistente, cria Term + Checklist + WorkflowEvent,
    atualiza session.generated_term_id e retorna str(term.id).

    Não verifica idempotência — o chamador deve garantir que o TR ainda não existe.
    """
    # Extrai o último conteúdo do assistente
    last_assistant_content = ""
    for msg in reversed(session.messages):
        if msg.get("role") == "assistant":
            last_assistant_content = msg.get("content", "")
            break

    term = await TermRepository.create(db, {
        "title": f"TR gerado via Chat — {session.id}",
        "category": "outro",
        "status": "Rascunho",
        "content": last_assistant_content,
        "created_by_id": current_user.id,
    })
    session.generated_term_id = term.id
    await db.flush()
    await ChecklistRepository.create_for_term(db, str(term.id))
    await WorkflowEventRepository.create(
        db,
        term_id=str(term.id),
        ator_id=str(current_user.id),
        acao="criar",
        para_setor="demandante",
    )
    return str(term.id)


async def _get_or_create_session(
    db: AsyncSession,
    session_id: str | None,
    mode: str,
) -> ChatSession:
    """Retorna sessão existente ou cria uma nova com system prompt."""
    if session_id:
        session = await _find_session(db, session_id)
        return session

    # Nova sessão: inicializa com system prompt
    system_prompt = AIChatService.get_initial_system_prompt(mode)
    session = ChatSession(
        id=uuid.uuid4(),
        mode=mode,
        messages=[system_prompt],
    )
    db.add(session)
    await db.flush()
    logger.info("Nova sessão de chat criada: id=%s mode=%s", session.id, mode)
    return session


async def _find_session(db: AsyncSession, session_id: str) -> ChatSession:
    """Busca sessão pelo ID ou levanta 404."""
    from sqlalchemy import select
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ChatSessionNotFoundError(session_id)
    return session
