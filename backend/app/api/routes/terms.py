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
from app.core.security import CurrentUser
from app.repositories.analysis import AnalysisRepository
from app.repositories.term import TermRepository
from app.repositories.user import UserRepository
from app.schemas.term import TermCreate, TermListResponse, TermResponse, TermSummary, TermUpdate
from app.services.docx_generator import DocxGeneratorService
from app.services.pdf_generator import PDFGeneratorService
from app.utils.exceptions import DocumentNotFoundError

router = APIRouter(prefix="/terms", tags=["Termos de Referência"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=TermResponse, status_code=201)
async def create_term(payload: TermCreate, db: DbDep, current_user: CurrentUser):
    """
    Cria um Termo de Referência manualmente (HU-05).
    Para criação via upload de documentos, use POST /upload.
    """
    data = payload.model_dump(exclude_none=True)
    data["created_by_id"] = current_user.id  # atribui o criador (assinatura)
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


_SETOR_LABELS = {
    "demandante": "Área Demandante", "dirop": "DIROP", "diraf": "DIRAF",
    "diger": "DIGER", "colic": "COLIC", "juridico": "Assessoria Jurídica",
}


async def _build_export_dict(db, term, fallback_user) -> dict:
    """Monta os dados de export do TR. A assinatura 'Responsável pela
    elaboração' usa SEMPRE quem CRIOU o TR (created_by_id); se não houver,
    cai para o usuário atual."""
    elaborador = None
    if getattr(term, "created_by_id", None):
        elaborador = await UserRepository.get_by_id(db, str(term.created_by_id))
    elaborador = elaborador or fallback_user
    return {
        "id": str(term.id),
        "title": term.title,
        "category": term.category,
        "status": term.status,
        "content": term.content,
        "sections": term.sections,
        "estimated_value": term.estimated_value,
        "original_filename": term.original_filename,
        "created_at": str(term.created_at),
        "elaborador_nome": getattr(elaborador, "nome", None),
        "elaborador_matricula": getattr(elaborador, "matricula", None),
        "elaborador_setor": _SETOR_LABELS.get(
            getattr(elaborador, "setor_id", ""), getattr(elaborador, "setor_id", "")
        ),
    }


def _safe_filename(title: str, ext: str) -> str:
    safe = "".join(c for c in title[:40] if c.isalnum() or c in " -_").strip()
    return f"TR_{safe.replace(' ', '_') or 'documento'}.{ext}"


@router.get("/{term_id}/export/pdf")
async def export_term_pdf(
    term_id: str, db: DbDep, current_user: CurrentUser,
    autoridade: str | None = None, autoridade_cargo: str | None = None,
):
    """Exporta um TR em PDF formatado com cabeçalho FSPH (HU-02, HU-03)."""
    term = await TermRepository.get_by_id(db, term_id)
    if not term:
        raise DocumentNotFoundError(term_id)

    term_dict = await _build_export_dict(db, term, current_user)
    term_dict["autoridade_nome"] = autoridade
    term_dict["autoridade_cargo"] = autoridade_cargo
    pdf_bytes = PDFGeneratorService.generate_term_pdf(term_dict)
    filename = _safe_filename(term.title, "pdf")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{term_id}/export/docx")
async def export_term_docx(
    term_id: str, db: DbDep, current_user: CurrentUser,
    autoridade: str | None = None, autoridade_cargo: str | None = None,
):
    """Exporta o TR em DOCX (Word) editável, mesma estrutura formal do PDF."""
    term = await TermRepository.get_by_id(db, term_id)
    if not term:
        raise DocumentNotFoundError(term_id)

    term_dict = await _build_export_dict(db, term, current_user)
    term_dict["autoridade_nome"] = autoridade
    term_dict["autoridade_cargo"] = autoridade_cargo
    docx_bytes = DocxGeneratorService.generate_term_docx(term_dict)
    filename = _safe_filename(term.title, "docx")

    return StreamingResponse(
        iter([docx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
