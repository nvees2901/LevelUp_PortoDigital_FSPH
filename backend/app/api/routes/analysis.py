"""
analysis.py (route) — Análise de conformidade de TRs

Endpoints:
  POST /api/v1/analysis              → analisar TR já cadastrado
  GET  /api/v1/analysis/{id}         → buscar análise por ID
  GET  /api/v1/analysis/term/{id}    → histórico de análises de um TR
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.analysis import AnalysisRepository
from app.repositories.term import TermRepository
from app.schemas.analysis import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisSummary,
    CriterionResult,
    Suggestion,
)
from app.services.compliance import ComplianceService
from app.utils.exceptions import AnalysisNotFoundError, DocumentNotFoundError

router = APIRouter(prefix="/analysis", tags=["Análise de Conformidade"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=AnalysisResponse, status_code=201)
async def analyze_term(payload: AnalysisRequest, db: DbDep):
    """
    Analisa um TR já cadastrado e gera novo registro de análise (HU-01).
    Permite re-analisar um TR após correções para ver a evolução do score.
    """
    term = await TermRepository.get_by_id(db, payload.term_id)
    if not term:
        raise DocumentNotFoundError(payload.term_id)

    if not term.content:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail="Este TR não possui conteúdo textual para análise. "
                   "Faça upload do documento via /upload."
        )

    # Executa análise
    compliance = ComplianceService.analyze(term.content, term.sections or {})

    # Persiste nova análise
    analysis = await AnalysisRepository.create(db, {
        "term_id": term.id,
        "compliance_score": compliance["compliance_score"],
        "status": compliance["status"],
        "criteria_results": compliance["criteria_results"],
        "suggestions": compliance["suggestions"],
        "legal_references": compliance["legal_references"],
    })

    # Atualiza status do TR
    await TermRepository.update(db, str(term.id), {"status": compliance["status"]})

    return AnalysisResponse(
        id=str(analysis.id),
        term_id=str(analysis.term_id),
        compliance_score=analysis.compliance_score,
        status=analysis.status,
        criteria_results=[CriterionResult(**r) for r in analysis.criteria_results],
        suggestions=[Suggestion(**s) for s in analysis.suggestions],
        legal_references=analysis.legal_references,
        created_at=str(analysis.created_at),
    )


@router.get("/term/{term_id}", response_model=list[AnalysisSummary])
async def get_analyses_by_term(term_id: str, db: DbDep):
    """
    Histórico de análises de um TR — mostra evolução do score ao longo do tempo.
    """
    term = await TermRepository.get_by_id(db, term_id)
    if not term:
        raise DocumentNotFoundError(term_id)

    analyses = await AnalysisRepository.list_by_term(db, term_id)
    return [AnalysisSummary.model_validate(a) for a in analyses]


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(analysis_id: str, db: DbDep):
    """Busca uma análise específica por ID."""
    analysis = await AnalysisRepository.get_by_id(db, analysis_id)
    if not analysis:
        raise AnalysisNotFoundError(analysis_id)

    return AnalysisResponse(
        id=str(analysis.id),
        term_id=str(analysis.term_id),
        compliance_score=analysis.compliance_score,
        status=analysis.status,
        criteria_results=[CriterionResult(**r) for r in analysis.criteria_results],
        suggestions=[Suggestion(**s) for s in analysis.suggestions],
        legal_references=analysis.legal_references,
        created_at=str(analysis.created_at),
    )
