"""
dashboard.py (route) — Estatísticas gerenciais (HU-04)

GET /api/v1/dashboard/stats
  Retorna contagens de TRs por status + 5 mais recentes.
  Usado pelo painel do Diretor (persona Carlos).
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.term import TermRepository
from app.schemas.term import TermSummary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/stats")
async def get_dashboard_stats(db: DbDep):
    """
    Estatísticas gerenciais em tempo real (HU-04).

    Retorna:
    {
      "total": 42,
      "por_status": {
        "Rascunho": 8,
        "Aguardando DIROP": 10,
        "Aguardando DIRAF": 5,
        "Aguardando DIGER": 3,
        "Instrução COLIC": 2,
        "Aguardando Jurídico": 4,
        "Aprovação DIRAF/DIGER": 2,
        "Homologado": 8
      },
      "conformidade_media": 74.5,
      "recent_terms": [ ...5 TRs mais recentes... ]
    }
    """
    stats = await TermRepository.get_dashboard_stats(db)

    # Serializa os TRs recentes com o schema
    recent_terms = [
        TermSummary.model_validate(t) for t in stats.pop("recent_terms", [])
    ]

    return {
        **stats,
        "recent_terms": recent_terms,
    }
