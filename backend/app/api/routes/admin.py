"""
admin.py (route) — Endpoints de gerenciamento para administradores

POST   /api/v1/admin/users                         → criar usuário
GET    /api/v1/admin/users                         → listar usuários
PUT    /api/v1/admin/users/{id}                    → atualizar usuário
DELETE /api/v1/admin/users/{id}                    → desativar usuário
POST   /api/v1/admin/context-documents              → upload de documento de contexto
GET    /api/v1/admin/context-documents              → listar documentos de contexto
DELETE /api/v1/admin/context-documents/{id}        → remover documento de contexto
POST   /api/v1/admin/context-documents/{id}/reindex → re-indexar documento (inclusive falhos)
GET    /api/v1/admin/context-documents/{id}/download → baixar arquivo original
GET    /api/v1/admin/knowledge-base/collections    → estatísticas das coleções ChromaDB
"""

import asyncio
import io
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import AdminUser
from app.repositories.context_document import ContextDocumentRepository
from app.repositories.user import UserRepository
from app.schemas.context_document import (
    ContextDocumentList,
    ContextDocumentResponse,
    KnowledgeBaseCollection,
    KnowledgeBaseCollectionList,
)
from app.schemas.user import UserAdminOut, UserCreate, UserUpdate
from app.services.auth import hash_password
from app.services.rag_service import RagService
from app.services.storage import delete as delete_storage, exists as storage_exists, read_bytes, save_context_document
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


# ------------------------------------------------------------------ #
# Gerenciamento de Usuários
# ------------------------------------------------------------------ #

@router.get("/users", response_model=list[UserAdminOut])
async def list_users(db: DbDep, current_user: AdminUser):
    """Lista todos os usuários cadastrados."""
    return await UserRepository.list_all(db)


@router.post("/users", response_model=UserAdminOut, status_code=201)
async def create_user(payload: UserCreate, db: DbDep, current_user: AdminUser):
    """Cria um novo usuário no sistema."""
    existing = await UserRepository.get_by_matricula(db, payload.matricula)
    if existing:
        raise HTTPException(status_code=409, detail="Matrícula já cadastrada.")

    user = await UserRepository.create(db, {
        "matricula": payload.matricula,
        "nome": payload.nome,
        "senha_hash": hash_password(payload.senha),
        "setor_id": payload.setor_id,
        "subunidade": payload.subunidade,
        "is_admin": payload.is_admin,
    })
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserAdminOut)
async def update_user(user_id: str, payload: UserUpdate, db: DbDep, current_user: AdminUser):
    """Atualiza dados de um usuário."""
    user = await UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    updates: dict = {}
    if payload.nome is not None:
        updates["nome"] = payload.nome
    if payload.senha is not None:
        updates["senha_hash"] = hash_password(payload.senha)
    if payload.setor_id is not None:
        updates["setor_id"] = payload.setor_id
    if payload.subunidade is not None:
        updates["subunidade"] = payload.subunidade
    if payload.is_admin is not None:
        updates["is_admin"] = payload.is_admin
    if payload.ativo is not None:
        updates["ativo"] = payload.ativo

    user = await UserRepository.update(db, user, updates)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
async def deactivate_user(user_id: str, db: DbDep, current_user: AdminUser):
    """Desativa um usuário (não remove do banco)."""
    user = await UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Você não pode desativar seu próprio usuário.")
    await UserRepository.update(db, user, {"ativo": False})
    await db.commit()


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

    storage_path = await save_context_document(file_bytes, filename)
    doc_filename = Path(storage_path).name if not storage_path.lower().startswith("gs://") else storage_path.split("/")[-1]

    doc = await ContextDocumentRepository.create(db, {
        "filename": doc_filename,
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

    await delete_storage(doc.storage_path)

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

    if not await storage_exists(doc.storage_path):
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

    if not await storage_exists(doc.storage_path):
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage.",
        )
    if doc.storage_path.lower().startswith("gs://"):
        file_bytes = await read_bytes(doc.storage_path)
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type=doc.mime_type,
            headers={"Content-Disposition": f"attachment; filename=\"{doc.original_filename}\""},
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
