"""
workflow_event.py (repository) — Acesso ao banco para WorkflowEvent

Gerencia o histórico de tramitação dos TRs.
Eventos são imutáveis: apenas inseridos, nunca atualizados ou deletados.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow_event import WorkflowEvent
from app.utils.logging import get_logger

logger = get_logger(__name__)


class WorkflowEventRepository:

    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        term_id: str | uuid.UUID,
        ator_id: str | uuid.UUID | None = None,
        de_setor: str | None = None,
        para_setor: str | None = None,
        acao: str,
        observacao: str | None = None,
    ) -> WorkflowEvent:
        """
        Registra um novo evento de tramitação.

        Uso:
            event = await WorkflowEventRepository.create(
                db,
                term_id=term.id,
                ator_id=current_user.id,
                de_setor="demandante",
                para_setor="dirop",
                acao="avancar",
                observacao="Aprovado pela DIROP",
            )
        """
        event = WorkflowEvent(
            term_id=term_id,
            ator_id=ator_id,
            de_setor=de_setor,
            para_setor=para_setor,
            acao=acao,
            observacao=observacao,
        )
        session.add(event)
        await session.flush()
        logger.info(
            "WorkflowEvent criado: term_id=%s acao=%r de=%r para=%r",
            term_id, acao, de_setor, para_setor,
        )
        return event

    @staticmethod
    async def list_by_term(
        session: AsyncSession, term_id: str | uuid.UUID
    ) -> list[WorkflowEvent]:
        """
        Lista todos os eventos de tramitação de um TR, em ordem cronológica.
        O mais antigo primeiro (útil para exibir histórico ao usuário).
        """
        result = await session.execute(
            select(WorkflowEvent)
            .where(WorkflowEvent.term_id == term_id)
            .order_by(WorkflowEvent.created_at.asc())
        )
        return list(result.scalars().all())
