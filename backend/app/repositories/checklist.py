"""
checklist.py (repository) — Acesso ao banco para TermChecklist

Gerencia o checklist de documentos obrigatórios de cada TR.
O checklist é criado automaticamente junto com o TR e atualizado
conforme os documentos são marcados como entregues.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.term_checklist import TermChecklist
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Campos booleanos do checklist
_CHECKLIST_FIELDS = ("dfd", "etp", "tr", "dotacao", "auth_dirop", "auth_diraf", "auth_diger")


class ChecklistRepository:

    @staticmethod
    async def get_by_term(
        session: AsyncSession, term_id: str | uuid.UUID
    ) -> TermChecklist | None:
        """Busca o checklist de um TR pelo UUID do termo. Retorna None se não existir."""
        result = await session.execute(
            select(TermChecklist).where(TermChecklist.term_id == term_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_for_term(
        session: AsyncSession, term_id: str | uuid.UUID
    ) -> TermChecklist:
        """
        Cria um checklist vazio (todos False) para o TR indicado.

        Uso:
            checklist = await ChecklistRepository.create_for_term(db, term.id)
        """
        checklist = TermChecklist(term_id=term_id)
        session.add(checklist)
        await session.flush()
        logger.info("Checklist criado para TR: term_id=%s", term_id)
        return checklist

    @staticmethod
    async def update(
        session: AsyncSession, term_id: str | uuid.UUID, **fields: bool
    ) -> TermChecklist | None:
        """
        Atualiza campos booleanos do checklist (PATCH semântico).
        Aceita apenas nomes de campos conhecidos; ignora campos inválidos.
        Retorna o checklist atualizado, ou None se não existir.

        Uso:
            updated = await ChecklistRepository.update(db, term_id, dfd=True, etp=True)
        """
        checklist = await ChecklistRepository.get_by_term(session, term_id)
        if checklist is None:
            return None

        for field, value in fields.items():
            if field in _CHECKLIST_FIELDS and value is not None:
                setattr(checklist, field, value)

        await session.flush()
        await session.refresh(checklist)
        logger.info("Checklist atualizado: term_id=%s campos=%s", term_id, list(fields.keys()))
        return checklist

    @staticmethod
    async def is_complete(session: AsyncSession, term_id: str | uuid.UUID) -> bool:
        """
        Verifica se todos os 7 documentos do checklist estão marcados como True.

        Retorna True somente quando DFD, ETP, TR, dotação e as 3 autorizações
        estiverem todas marcadas.
        """
        checklist = await ChecklistRepository.get_by_term(session, term_id)
        if checklist is None:
            return False
        return all(getattr(checklist, field) for field in _CHECKLIST_FIELDS)
