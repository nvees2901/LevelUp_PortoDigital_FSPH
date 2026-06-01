"""
admin.py (route) — Endpoints de gerenciamento para administradores

POST   /api/v1/admin/context-documents              → upload de documento de contexto
GET    /api/v1/admin/context-documents              → listar documentos de contexto
DELETE /api/v1/admin/context-documents/{id}        → remover documento de contexto
POST   /api/v1/admin/context-documents/{id}/reindex    → re-indexar documento (inclusive falhos)
POST   /api/v1/admin/context-documents/{id}/deactivate → desativar documento (remove chunks do ChromaDB)
POST   /api/v1/admin/context-documents/{id}/activate   → ativar/re-indexar documento desativado
GET    /api/v1/admin/context-documents/{id}/download   → baixar arquivo original
POST   /api/v1/admin/context-documents/text        → adicionar texto puro como contexto RAG
GET    /api/v1/admin/knowledge-base/collections    → estatísticas das coleções ChromaDB
"""

import asyncio
import os
import re
import uuid
from pathlib import Path
from typing import Annotated, Literal

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import AdminUser
from app.repositories.context_document import ContextDocumentRepository
from app.schemas.context_document import (
    ContextDocumentList,
    ContextDocumentResponse,
    ContextDocumentTextCreate,
    KnowledgeBaseCollection,
    KnowledgeBaseCollectionList,
)
from app.services.rag_service import RagService
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}


def _doc_to_response(doc) -> ContextDocumentResponse:
    """Converte um ContextDocument ORM em ContextDocumentResponse."""
    return ContextDocumentResponse(
        id=str(doc.id),
        filename=doc.filename,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        uploaded_by_id=str(doc.uploaded_by_id) if doc.uploaded_by_id is not None else None,
        uploaded_at=str(doc.uploaded_at),
        indexed_at=str(doc.indexed_at) if doc.indexed_at is not None else None,
        status=doc.status,
        chunks_count=doc.chunks_count,
        error_message=doc.error_message,
        is_active=doc.is_active,
        collection=doc.collection,
        is_seed=doc.is_seed,
    )


async def _run_indexing_task(
    doc_id: str, storage_path: str, filename: str, collection: str = "context_extra"
) -> None:
    """Indexa um documento no ChromaDB e atualiza o status no banco."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as bg_db:
        bg_doc = await ContextDocumentRepository.get_by_id(bg_db, doc_id)
        if not bg_doc:
            return
        try:
            chunks = await RagService.index_uploaded_document(storage_path, filename, collection)
            await ContextDocumentRepository.mark_indexed(bg_db, bg_doc, chunks)
            await bg_db.commit()
            logger.info("Documento indexado: %s em %s (%d chunks)", filename, collection, chunks)
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
    collection: Annotated[
        Literal["context_extra", "lei_14133", "termos_aprovados"],
        Form(),
    ] = "context_extra",
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
        "collection": collection,
        "status": "pending",
    })
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        _run_indexing_task, str(doc.id), doc.storage_path, doc.filename, doc.collection
    )

    return _doc_to_response(doc)


@router.get("/context-documents", response_model=ContextDocumentList)
async def list_context_documents(db: DbDep, current_user: AdminUser):
    """Lista todos os documentos de contexto."""
    docs = await ContextDocumentRepository.list_all(db)
    return ContextDocumentList(
        items=[_doc_to_response(d) for d in docs],
        total=len(docs),
    )


@router.post("/context-documents/text", response_model=ContextDocumentResponse, status_code=201)
async def create_text_context_document(
    payload: ContextDocumentTextCreate,
    background_tasks: BackgroundTasks,
    db: DbDep,
    current_user: AdminUser,
):
    """Cria um documento de contexto a partir de texto puro (sem upload de arquivo)."""
    safe_title = re.sub(r'[^\w\s-]', '', payload.title).strip().replace(' ', '_')[:50]
    unique_filename = f"{uuid.uuid4()}_{safe_title}.txt"

    storage_dir = Path(settings.CONTEXT_DOCS_DIR)
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = str(storage_dir / unique_filename)

    size_bytes = len(payload.content.encode("utf-8"))
    max_bytes = settings.CONTEXT_DOC_MAX_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Texto muito grande: {size_bytes / 1024 / 1024:.1f} MB. Máximo: {settings.CONTEXT_DOC_MAX_SIZE_MB} MB",
        )

    try:
        async with aiofiles.open(storage_path, "w", encoding="utf-8") as f:
            await f.write(payload.content)
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao salvar arquivo: {e}",
        )

    doc = await ContextDocumentRepository.create(db, {
        "filename": unique_filename,
        "original_filename": f"{payload.title}.txt",
        "mime_type": "text/plain",
        "size_bytes": size_bytes,
        "storage_path": storage_path,
        "uploaded_by_id": current_user.id,
        "collection": payload.collection,
        "status": "pending",
    })
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        _run_indexing_task, str(doc.id), doc.storage_path, doc.filename, doc.collection
    )

    return _doc_to_response(doc)


@router.delete("/context-documents/{doc_id}", status_code=204)
async def delete_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Remove um documento de contexto e seus chunks do ChromaDB."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    if not doc.is_seed:
        try:
            await asyncio.to_thread(os.remove, doc.storage_path)
        except FileNotFoundError:
            logger.warning("Arquivo não encontrado ao deletar: %s", doc.storage_path)

    await asyncio.to_thread(RagService.remove_document_chunks, doc.filename, doc.collection)

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

    if not doc.is_active:
        raise HTTPException(
            status_code=409,
            detail="Documento inativo não pode ser re-indexado. Reative-o primeiro.",
        )

    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage. Remova e faça upload novamente.",
        )

    await ContextDocumentRepository.mark_pending(db, doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        _run_indexing_task, str(doc.id), doc.storage_path, doc.filename, doc.collection
    )

    return _doc_to_response(doc)


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


@router.post("/context-documents/{doc_id}/deactivate", response_model=ContextDocumentResponse)
async def deactivate_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Desativa um TR indexado: remove seus chunks do ChromaDB sem excluir o arquivo."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    if not doc.is_active:
        raise HTTPException(status_code=409, detail="Documento já está inativo.")
    if doc.status != "indexed":
        raise HTTPException(
            status_code=422,
            detail="Apenas documentos com status 'indexed' podem ser desativados.",
        )

    await asyncio.to_thread(RagService.remove_document_chunks, doc.filename, doc.collection)
    await ContextDocumentRepository.set_active(db, doc, False)
    doc.chunks_count = 0
    await db.flush()
    await db.commit()
    await db.refresh(doc)

    return _doc_to_response(doc)


@router.post("/context-documents/{doc_id}/activate", response_model=ContextDocumentResponse)
async def activate_context_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: DbDep,
    current_user: AdminUser,
):
    """Reativa um TR desativado: re-indexa seus chunks no ChromaDB."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    if doc.is_active:
        raise HTTPException(status_code=409, detail="Documento já está ativo.")
    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage. Remova e faça upload novamente.",
        )

    await ContextDocumentRepository.set_active(db, doc, True)
    await ContextDocumentRepository.mark_pending(db, doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        _run_indexing_task, str(doc.id), doc.storage_path, doc.filename, doc.collection
    )

    return _doc_to_response(doc)


@router.get("/knowledge-base/collections", response_model=KnowledgeBaseCollectionList)
async def get_knowledge_base_collections(current_user: AdminUser):
    """Retorna estatísticas das coleções ChromaDB (bases fixas + documentos do admin)."""
    stats = await asyncio.to_thread(RagService.get_collections_stats)
    items = [KnowledgeBaseCollection(**s) for s in stats]
    return KnowledgeBaseCollectionList(items=items, total=len(items))
