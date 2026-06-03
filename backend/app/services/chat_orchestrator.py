"""
chat_orchestrator.py — Orquestração de sessões de chat IA

Responsabilidades:
  - Criar novas sessões (com system prompt) ou carregar existentes.
  - Persistir um Termo de Referência a partir do conteúdo gerado pelo assistente.

Por que um serviço separado?
  chat.py (rota) não deve conter lógica de criação de entidades de domínio
  nem chamar múltiplos repositories diretamente. O orchestrator centraliza
  essas operações e deixa a rota apenas com o fluxo HTTP.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatSession
from app.models.user import User
from app.repositories.chat_session import ChatSessionRepository
from app.repositories.checklist import ChecklistRepository
from app.repositories.term import TermRepository
from app.repositories.workflow_event import WorkflowEventRepository
from app.services.ai_chat import AIChatService
from app.utils.exceptions import NoAssistantContentError
from app.utils.logging import get_logger

logger = get_logger(__name__)


def _title_from_content(content: str, fallback: str) -> str:
    """Deriva um título limpo a partir da seção 'Objeto' do TR sintetizado.

    Procura o cabeçalho de Objeto e usa a primeira linha de texto como título;
    se não encontrar, usa o fallback (título da sessão).
    """
    lines = content.split("\n")
    for i, ln in enumerate(lines):
        if re.match(r"^#{1,6}\s", ln) and "objeto" in ln.lower():
            for j in range(i + 1, min(i + 6, len(lines))):
                t = lines[j].strip().lstrip("*").strip()
                if not t or re.match(r"^#{1,6}\s", lines[j]):
                    continue
                if t.lower().startswith("art.") or t.lower().startswith("lei"):
                    continue
                return t.rstrip(".")[:140]
            break
    return fallback


class ChatOrchestratorService:

    # ------------------------------------------------------------------ #
    # Gerenciamento de sessão
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_or_create_session(
        db: AsyncSession,
        session_id: str | None,
        mode: str,
        current_user: User,
        term_id: str | None = None,
    ) -> ChatSession:
        """
        Retorna sessão existente (com guarda anti-IDOR) ou cria uma nova.

        Quando session_id é fornecido, delega ao ChatSessionRepository que
        filtra por id E user_id — garantindo que um usuário nunca acesse
        sessão de outro.

        Quando session_id é None, cria sessão nova com o system prompt
        adequado ao modo solicitado.

        Args:
            db:           Sessão do banco de dados.
            session_id:   UUID da sessão existente, ou None para criar nova.
            mode:         Modo de operação ('gerar', 'analisar', 'consultar').
            current_user: Usuário autenticado (dono da sessão).
            term_id:      UUID do TR vinculado (apenas modo 'analisar').
        """
        if session_id:
            return await ChatSessionRepository.find_by_id_for_user(
                db, session_id, current_user.id
            )

        # Nova sessão: inicializa com system prompt
        term_content: str | None = None
        if term_id:
            term = await TermRepository.get_by_id(db, term_id)
            term_content = term.content if term else None

        system_prompt = AIChatService.get_initial_system_prompt(mode, term_content=term_content)
        session = ChatSession(
            id=uuid.uuid4(),
            mode=mode,
            messages=[system_prompt],
            user_id=current_user.id,
            term_id=uuid.UUID(term_id) if term_id else None,
        )
        db.add(session)
        await db.flush()
        logger.info(
            "Nova sessão de chat criada: id=%s mode=%s user_id=%s",
            session.id,
            mode,
            current_user.id,
        )
        return session

    # ------------------------------------------------------------------ #
    # Persistência do TR gerado
    # ------------------------------------------------------------------ #

    @staticmethod
    async def persist_term_from_session(
        db: AsyncSession,
        session: ChatSession,
        current_user: User,
        content_override: str | None = None,
    ) -> str:
        """
        Cria um TR a partir do conteúdo gerado pelo assistente na sessão.

        Extrai o último conteúdo do assistente, cria Term + Checklist +
        WorkflowEvent, atualiza session.generated_term_id e retorna str(term.id).

        Não verifica idempotência — o chamador deve garantir que o TR ainda
        não existe (verificar session.generated_term_id antes de chamar).

        Raises:
            NoAssistantContentError: se a sessão não tem mensagem do assistente.
        """
        from app.services.pdf_generator import clean_tr_content

        if content_override is not None and content_override.strip():
            # TR já sintetizado a partir de toda a conversa — usa direto.
            tr_content = clean_tr_content(content_override)
        else:
            last_assistant_content = ""
            for msg in reversed(session.messages):
                if msg.get("role") == "assistant":
                    last_assistant_content = msg.get("content", "")
                    break
            if not last_assistant_content:
                raise NoAssistantContentError()
            tr_content = clean_tr_content(last_assistant_content)

        # Título do TR: usa o objeto descrito pelo usuário (título da sessão,
        # definido a partir da 1ª mensagem) em vez do UUID da sessão.
        raw_title = (session.title or "").strip()
        fallback_title = raw_title[:140] if raw_title else "Termo de Referência gerado via Chat"
        # Prefere um título limpo derivado da seção "Objeto" do TR.
        term_title = _title_from_content(tr_content, fallback_title)

        term = await TermRepository.create(db, {
            "title": term_title,
            "category": "outro",
            "status": "Rascunho",
            "content": tr_content,
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
