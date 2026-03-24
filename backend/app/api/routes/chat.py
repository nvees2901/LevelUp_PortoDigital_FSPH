"""
chat.py (route) — Chat IA com 3 modos de operação

POST   /api/v1/chat              → enviar mensagem (cria sessão se necessário)
GET    /api/v1/chat/{session_id} → histórico da sessão
DELETE /api/v1/chat/{session_id} → encerrar sessão
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.chat_session import ChatSession
from app.repositories.term import TermRepository
from app.schemas.chat import ChatRequest, ChatResponse, ChatSessionResponse, ChatMessage
from app.services.ai_chat import AIChatService
from app.utils.exceptions import ChatSessionNotFoundError
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat IA"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=ChatResponse)
async def send_message(payload: ChatRequest, db: DbDep):
    """
    Envia uma mensagem ao assistente IA (HU-02).

    Fluxo:
      - Se session_id não fornecido: cria nova sessão com system prompt
      - Se session_id fornecido: continua sessão existente
      - Chama OpenAI (ou mock) com histórico completo
      - Salva a nova mensagem no histórico
      - Se modo 'gerar' e TR completo detectado: salva TR automaticamente
    """
    # --- Carrega ou cria sessão ---
    session = await _get_or_create_session(db, payload.session_id, payload.mode)

    # --- Prepara histórico para a IA ---
    history = [m for m in session.messages if m.get("role") != "system"]

    # --- Chama o serviço de IA ---
    ai_result = await AIChatService.process_message(
        message=payload.message,
        mode=session.mode,
        history=history,
    )

    # --- Atualiza histórico na sessão ---
    session.add_message("user", payload.message)
    session.add_message("assistant", ai_result["content"])
    await db.flush()

    # --- Se TR foi gerado, salva-o ---
    generated_term_id = None
    if ai_result.get("term_complete") and session.mode == "gerar":
        term = await TermRepository.create(db, {
            "title": f"TR gerado via Chat — {session.id}",
            "category": "outro",
            "status": "rascunho",
            "content": ai_result["content"],
        })
        session.generated_term_id = term.id
        generated_term_id = str(term.id)
        await db.flush()
        logger.info("TR gerado via chat: term_id=%s session_id=%s", term.id, session.id)

    return ChatResponse(
        message=ai_result["content"],
        session_id=str(session.id),
        mode=session.mode,
        generated_term_id=generated_term_id,
        is_mock=ai_result.get("is_mock", False),
    )


@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_session(session_id: str, db: DbDep):
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
async def delete_session(session_id: str, db: DbDep):
    """Encerra e remove uma sessão de chat."""
    session = await _find_session(db, session_id)
    await db.delete(session)
    await db.flush()


# ------------------------------------------------------------------ #
# Utilitários internos
# ------------------------------------------------------------------ #

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
