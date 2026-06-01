"""
chat_session.py (repository) — Acesso ao banco para ChatSession

Padrão: métodos estáticos (como TermRepository / AnalysisRepository).
O chamador é responsável por commit/rollback — apenas flush() é emitido aqui.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatSession
from app.utils.exceptions import ChatSessionNotFoundError
from app.utils.logging import get_logger

logger = get_logger(__name__)


class ChatSessionRepository:

    # ------------------------------------------------------------------ #
    # Leitura
    # ------------------------------------------------------------------ #

    @staticmethod
    async def find_by_id_for_user(
        db: AsyncSession,
        session_id: str,
        user_id: uuid.UUID,
    ) -> ChatSession:
        """
        Busca uma sessão pelo ID e pelo dono, ou levanta ChatSessionNotFoundError.

        A filtragem por user_id é a guarda anti-IDOR: um usuário autenticado
        nunca pode acessar a sessão de outro, mesmo conhecendo o UUID.
        """
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise ChatSessionNotFoundError(session_id)
        return session

    @staticmethod
    async def list_by_user(
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        mode: str | None = None,
        limit: int = 50,
    ) -> list[ChatSession]:
        """
        Lista sessões de um usuário, mais recentes primeiro.

        Args:
            user_id: ID do usuário dono das sessões.
            mode:    Filtro opcional por modo ('gerar', 'analisar', 'consultar').
            limit:   Máximo de sessões retornadas (padrão: 50).
        """
        stmt = select(ChatSession).where(ChatSession.user_id == user_id)
        if mode:
            stmt = stmt.where(ChatSession.mode == mode)
        stmt = stmt.order_by(ChatSession.updated_at.desc()).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())
