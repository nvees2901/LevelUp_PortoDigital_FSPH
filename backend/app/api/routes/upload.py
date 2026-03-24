"""
upload.py (route) — Pipeline completo de upload e análise automática

POST /api/v1/upload
  1. Recebe arquivo (PDF/DOCX/DOC, max 10MB)
  2. Valida formato e tamanho
  3. Extrai texto (DocumentService)
  4. Detecta seções e campos (NLPService)
  5. Analisa conformidade (ComplianceService)
  6. Salva Term + Analysis no banco
  7. Retorna resultado completo

Este é o endpoint mais complexo do sistema — orquestra 3 services.
"""

import os
import uuid
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.repositories.analysis import AnalysisRepository
from app.repositories.term import TermRepository
from app.schemas.analysis import AnalysisResponse, CriterionResult, Suggestion
from app.schemas.term import TermResponse
from app.services.compliance import ComplianceService
from app.services.document import DocumentService
from app.services.nlp import NLPService
from app.utils.exceptions import FileTooLargeError, UnsupportedFormatError
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/upload", tags=["Upload e Análise"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


class UploadResponse:
    """Resposta do upload com TR e análise embutidos."""
    def __init__(self, term: TermResponse, analysis: AnalysisResponse):
        self.term = term
        self.analysis = analysis


@router.post("", status_code=201)
async def upload_document(file: UploadFile, db: DbDep):
    """
    Upload de documento com análise automática (HU-01, HU-05).

    Pipeline completo:
      arquivo → extração de texto → NLP → conformidade → salvar → resposta

    Aceita: PDF, DOCX, DOC (máximo 10 MB)
    """
    filename = file.filename or "documento"

    # --- 1. Valida formato ---
    if not DocumentService.is_supported(filename):
        raise UnsupportedFormatError(filename)

    # --- 2. Lê e valida tamanho ---
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)

    if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
        raise FileTooLargeError(size_mb, settings.MAX_FILE_SIZE_MB)

    logger.info("Upload recebido: filename=%r size=%.2fMB", filename, size_mb)

    # --- 3. Extrai texto ---
    text = await DocumentService.extract_text(file_bytes, filename)

    # --- 4. NLP: detecta seções, campos e valor ---
    sections = NLPService.detect_sections(text)
    variable_fields = NLPService.detect_variable_fields(text)
    estimated_value = NLPService.extract_estimated_value(text)
    category = NLPService.detect_category(text)

    # --- 5. Salva o arquivo fisicamente ---
    file_path = await _save_file(file_bytes, filename)

    # --- 6. Persiste o Term no banco ---
    title = _extract_title(text, filename)
    term = await TermRepository.create(db, {
        "title": title,
        "category": category,
        "status": "em_analise",
        "content": text[:50_000],  # limita a 50k chars no banco
        "sections": sections,
        "variable_fields": variable_fields,
        "estimated_value": estimated_value,
        "original_filename": filename,
        "file_path": file_path,
    })

    # --- 7. Analisa conformidade ---
    compliance = ComplianceService.analyze(text, sections)

    # --- 8. Persiste a Analysis ---
    analysis = await AnalysisRepository.create(db, {
        "term_id": term.id,
        "compliance_score": compliance["compliance_score"],
        "status": compliance["status"],
        "criteria_results": compliance["criteria_results"],
        "suggestions": compliance["suggestions"],
        "legal_references": compliance["legal_references"],
    })

    # --- 9. Atualiza status do TR com base na análise ---
    await TermRepository.update(db, str(term.id), {
        "status": compliance["status"],
    })

    logger.info(
        "Upload concluído: term_id=%s score=%.2f status=%s",
        term.id, compliance["compliance_score"], compliance["status"],
    )

    # --- 10. Monta resposta ---
    term_response = TermResponse.model_validate(term)
    analysis_response = AnalysisResponse(
        id=str(analysis.id),
        term_id=str(analysis.term_id),
        compliance_score=analysis.compliance_score,
        status=analysis.status,
        criteria_results=[
            CriterionResult(**r) for r in analysis.criteria_results
        ],
        suggestions=[
            Suggestion(**s) for s in analysis.suggestions
        ],
        legal_references=analysis.legal_references,
        created_at=str(analysis.created_at),
    )

    return {"term": term_response, "analysis": analysis_response}


# ------------------------------------------------------------------ #
# Utilitários internos
# ------------------------------------------------------------------ #

async def _save_file(file_bytes: bytes, filename: str) -> str:
    """Salva o arquivo no disco e retorna o caminho."""
    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)

    # Nome único para evitar colisões
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_bytes)

    return file_path


def _extract_title(text: str, filename: str) -> str:
    """
    Tenta extrair o título do documento a partir do texto.
    Fallback: usa o nome do arquivo sem extensão.
    """
    # Tenta as primeiras linhas não-vazias como título
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if lines:
        # Primeira linha com tamanho razoável para um título
        for line in lines[:5]:
            if 10 <= len(line) <= 300:
                return line[:300]

    # Fallback: nome do arquivo sem extensão
    return filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
