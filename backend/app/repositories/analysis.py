"""
analysis.py (repository) — Acesso ao banco para Análises de Conformidade
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.utils.logging import get_logger

logger = get_logger(__name__)


class AnalysisRepository:

    @staticmethod
    async def create(session: AsyncSession, data: dict) -> Analysis:
        """Persiste o resultado de uma análise de conformidade."""
        analysis = Analysis(**data)
        session.add(analysis)
        await session.flush()
        logger.info(
            "Análise criada: id=%s term_id=%s score=%.2f",
            analysis.id,
            analysis.term_id,
            analysis.compliance_score,
        )
        return analysis

    @staticmethod
    async def get_by_id(
        session: AsyncSession, analysis_id: str
    ) -> Analysis | None:
        """Busca uma análise pelo UUID."""
        result = await session.execute(
            select(Analysis).where(Analysis.id == analysis_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_term(
        session: AsyncSession, term_id: str
    ) -> list[Analysis]:
        """
        Retorna o histórico de análises de um TR específico,
        ordenado da mais recente para a mais antiga.

        Por que histórico?
          Um TR pode ser analisado várias vezes após ajustes.
          Isso permite ao gestor ver a evolução do score ao longo do tempo.
        """
        result = await session.execute(
            select(Analysis)
            .where(Analysis.term_id == term_id)
            .order_by(Analysis.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_latest_by_term(
        session: AsyncSession, term_id: str
    ) -> Analysis | None:
        """Retorna a análise mais recente de um TR (usada no dashboard)."""
        result = await session.execute(
            select(Analysis)
            .where(Analysis.term_id == term_id)
            .order_by(Analysis.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
