"""
admin.py (route) — Endpoints de gerenciamento para administradores

POST   /api/v1/admin/context-documents              → upload de documento de contexto
GET    /api/v1/admin/context-documents              → listar documentos de contexto
DELETE /api/v1/admin/context-documents/{id}        → remover documento de contexto
POST   /api/v1/admin/context-documents/{id}/reindex → re-indexar documento (inclusive falhos)
GET    /api/v1/admin/context-documents/{id}/download → baixar arquivo original
GET    /api/v1/admin/knowledge-base/collections    → estatísticas das coleções ChromaDB
"""

import asyncio
import os
import uuid
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import AdminUser
from app.repositories.context_document import ContextDocumentRepository
from app.schemas.context_document import (
    ContextDocumentList,
    ContextDocumentResponse,
    KnowledgeBaseCollection,
    KnowledgeBaseCollectionList,
)
from app.services.rag_service import RagService
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


async def _run_indexing_task(doc_id: str, storage_path: str, filename: str) -> None:
    """Indexa um documento no ChromaDB e atualiza o status no banco."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as bg_db:
        bg_doc = await ContextDocumentRepository.get_by_id(bg_db, doc_id)
        if not bg_doc:
            return
        try:
            chunks = await RagService.index_uploaded_document(storage_path, filename)
            await ContextDocumentRepository.mark_indexed(bg_db, bg_doc, chunks)
            await bg_db.commit()
            logger.info("Documento indexado: %s (%d chunks)", filename, chunks)
        except Exception as e:
            await ContextDocumentRepository.mark_failed(bg_db, bg_doc, str(e))
            await bg_db.commit()
            logger.error("Falha ao indexar %s: %s", filename, e)


@router.post("/context-documents", response_model=ContextDocumentResponse, status_code=201)
async def upload_context_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: DbDep,
    current_user: AdminUser,
):
    """Upload de documento de contexto para a base de conhecimento da IA."""
    filename = file.filename or "documento"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Formato não suportado: {ext}. Use: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    size_bytes = len(file_bytes)
    max_bytes = settings.CONTEXT_DOC_MAX_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Arquivo muito grande: {size_bytes / 1024 / 1024:.1f} MB. Máximo: {settings.CONTEXT_DOC_MAX_SIZE_MB} MB",
        )

    storage_dir = Path(settings.CONTEXT_DOCS_DIR)
    storage_dir.mkdir(parents=True, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}{ext}"
    storage_path = str(storage_dir / unique_filename)

    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(file_bytes)

    doc = await ContextDocumentRepository.create(db, {
        "filename": unique_filename,
        "original_filename": filename,
        "mime_type": file.content_type or "application/octet-stream",
        "size_bytes": size_bytes,
        "storage_path": storage_path,
        "uploaded_by_id": current_user.id,
        "status": "pending",
    })
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(_run_indexing_task, str(doc.id), doc.storage_path, doc.filename)

    return ContextDocumentResponse(
        id=str(doc.id),
        filename=doc.filename,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        uploaded_by_id=str(doc.uploaded_by_id),
        uploaded_at=doc.uploaded_at,
        indexed_at=doc.indexed_at,
        status=doc.status,
        chunks_count=doc.chunks_count,
        error_message=doc.error_message,
    )


@router.get("/context-documents", response_model=ContextDocumentList)
async def list_context_documents(db: DbDep, current_user: AdminUser):
    """Lista todos os documentos de contexto."""
    docs = await ContextDocumentRepository.list_all(db)
    return ContextDocumentList(
        items=[
            ContextDocumentResponse(
                id=str(d.id),
                filename=d.filename,
                original_filename=d.original_filename,
                mime_type=d.mime_type,
                size_bytes=d.size_bytes,
                uploaded_by_id=str(d.uploaded_by_id),
                uploaded_at=d.uploaded_at,
                indexed_at=d.indexed_at,
                status=d.status,
                chunks_count=d.chunks_count,
                error_message=d.error_message,
            )
            for d in docs
        ],
        total=len(docs),
    )


@router.delete("/context-documents/{doc_id}", status_code=204)
async def delete_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Remove um documento de contexto e seus chunks do ChromaDB."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    try:
        await asyncio.to_thread(os.remove, doc.storage_path)
    except FileNotFoundError:
        logger.warning("Arquivo não encontrado ao deletar: %s", doc.storage_path)

    await asyncio.to_thread(RagService.remove_document_chunks, doc.filename)

    await ContextDocumentRepository.delete(db, doc)
    await db.commit()


@router.post("/context-documents/{doc_id}/reindex", response_model=ContextDocumentResponse)
async def reindex_context_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: DbDep,
    current_user: AdminUser,
):
    """Re-indexa um documento de contexto (útil para documentos que falharam na indexação)."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage. Remova e faça upload novamente.",
        )

    await ContextDocumentRepository.mark_pending(db, doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(_run_indexing_task, str(doc.id), doc.storage_path, doc.filename)

    return ContextDocumentResponse(
        id=str(doc.id),
        filename=doc.filename,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        uploaded_by_id=str(doc.uploaded_by_id),
        uploaded_at=doc.uploaded_at,
        indexed_at=doc.indexed_at,
        status=doc.status,
        chunks_count=doc.chunks_count,
        error_message=doc.error_message,
    )


@router.get("/context-documents/{doc_id}/download")
async def download_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Baixa o arquivo original de um documento de contexto."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage.",
        )

    return FileResponse(
        path=doc.storage_path,
        filename=doc.original_filename,
        media_type=doc.mime_type,
    )


@router.get("/knowledge-base/collections", response_model=KnowledgeBaseCollectionList)
async def get_knowledge_base_collections(current_user: AdminUser):
    """Retorna estatísticas das coleções ChromaDB (bases fixas + documentos do admin)."""
    stats = await asyncio.to_thread(RagService.get_collections_stats)
    items = [KnowledgeBaseCollection(**s) for s in stats]
    return KnowledgeBaseCollectionList(items=items, total=len(items))
