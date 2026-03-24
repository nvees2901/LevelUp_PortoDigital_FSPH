"""
terms.py (route) — CRUD completo de Termos de Referência

Endpoints:
  POST   /api/v1/terms          → criar TR manual
  GET    /api/v1/terms          → listar com filtros e paginação
  GET    /api/v1/terms/{id}     → buscar por ID
  PUT    /api/v1/terms/{id}     → atualizar
  DELETE /api/v1/terms/{id}     → remover
  GET    /api/v1/terms/{id}/export/pdf → download do TR em PDF
"""

import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.analysis import AnalysisRepository
from app.repositories.term import TermRepository
from app.schemas.term import TermCreate, TermListResponse, TermResponse, TermSummary, TermUpdate
from app.services.pdf_generator import PDFGeneratorService
from app.utils.exceptions import DocumentNotFoundError

router = APIRouter(prefix="/terms", tags=["Termos de Referência"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=TermResponse, status_code=201)
async def create_term(payload: TermCreate, db: DbDep):
    """
    Cria um Termo de Referência manualmente (HU-05).
    Para criação via upload de documentos, use POST /upload.
    """
    data = payload.model_dump(exclude_none=True)
    term = await TermRepository.create(db, data)
    return TermResponse.model_validate(term)


@router.get("", response_model=TermListResponse)
async def list_terms(
    db: DbDep,
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(10, ge=1, le=100, description="Itens por página"),
    category: str | None = Query(None, description="Filtrar por categoria"),
    status: str | None = Query(None, description="Filtrar por status"),
    search: str | None = Query(None, description="Busca textual no título"),
):
    """
    Lista TRs com filtros opcionais e paginação (HU-03, HU-04).

    Exemplos:
      GET /api/v1/terms?category=aquisicao&search=equipamento&page=1&limit=10
    """
    terms, total = await TermRepository.list(
        db, category=category, status=status, search=search,
        page=page, limit=limit,
    )
    pages = math.ceil(total / limit) if total > 0 else 0
    return TermListResponse(
        items=[TermSummary.model_validate(t) for t in terms],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/{term_id}", response_model=TermResponse)
async def get_term(term_id: str, db: DbDep):
    """Busca um TR por ID (HU-03)."""
    term = await TermRepository.get_by_id(db, term_id)
    if not term:
        raise DocumentNotFoundError(term_id)
    return TermResponse.model_validate(term)


@router.put("/{term_id}", response_model=TermResponse)
async def update_term(term_id: str, payload: TermUpdate, db: DbDep):
    """Atualiza campos de um TR existente (HU-05)."""
    data = payload.model_dump(exclude_none=True)
    term = await TermRepository.update(db, term_id, data)
    if not term:
        raise DocumentNotFoundError(term_id)
    return TermResponse.model_validate(term)


@router.delete("/{term_id}", status_code=204)
async def delete_term(term_id: str, db: DbDep):
    """Remove um TR e suas análises associadas (CASCADE)."""
    deleted = await TermRepository.delete(db, term_id)
    if not deleted:
        raise DocumentNotFoundError(term_id)


@router.get("/{term_id}/export/pdf")
async def export_term_pdf(term_id: str, db: DbDep):
    """
    Exporta um TR em PDF formatado com cabeçalho FSPH (HU-02, HU-03).
    Retorna um arquivo PDF para download imediato.
    """
    term = await TermRepository.get_by_id(db, term_id)
    if not term:
        raise DocumentNotFoundError(term_id)

    # Busca a análise mais recente para incluir no PDF (se existir)
    term_dict = {
        "id": str(term.id),
        "title": term.title,
        "category": term.category,
        "status": term.status,
        "content": term.content,
        "sections": term.sections,
        "estimated_value": term.estimated_value,
        "original_filename": term.original_filename,
        "created_at": str(term.created_at),
    }

    pdf_bytes = PDFGeneratorService.generate_term_pdf(term_dict)

    # Nome do arquivo para download
    safe_title = "".join(c for c in term.title[:40] if c.isalnum() or c in " -_")
    filename = f"TR_{safe_title.replace(' ', '_')}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
