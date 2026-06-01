"""
upload.py (route) — Delegador de upload para IngestionService

POST /api/v1/upload
  Recebe o arquivo, lê os bytes e delega todo o pipeline ao IngestionService.
  Aceita: PDF, DOCX, DOC (máximo 10 MB)

Toda a lógica de negócio (validação, NLP, conformidade, persistência) vive em
  app/services/ingestion.py — esta rota é apenas um adaptador HTTP.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser
from app.services.ingestion import IngestionService

router = APIRouter(prefix="/upload", tags=["Upload e Análise"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", status_code=201)
async def upload_document(file: UploadFile, db: DbDep, current_user: CurrentUser):
    """
    Upload de documento com análise automática (HU-01, HU-05).

    Pipeline completo:
      arquivo → extração de texto → NLP → conformidade → salvar → resposta

    Aceita: PDF, DOCX, DOC (máximo 10 MB)
    """
    file_bytes = await file.read()
    filename = file.filename or "documento"

    term_response, analysis_response = await IngestionService.ingest(
        db, file_bytes, filename, current_user
    )

    return {"term": term_response, "analysis": analysis_response}
