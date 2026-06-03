"""
admin.py (route) — Endpoints de gerenciamento para administradores

POST   /api/v1/admin/users                         → criar usuário
GET    /api/v1/admin/users                         → listar usuários
PUT    /api/v1/admin/users/{id}                    → atualizar usuário
DELETE /api/v1/admin/users/{id}                    → desativar usuário
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
import io
import os
import re
import uuid
from pathlib import Path
from typing import Annotated, Literal

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import AdminUser
from app.repositories.context_document import ContextDocumentRepository
from app.repositories.user import UserRepository
from app.schemas.context_document import (
    ContextDocumentList,
    ContextDocumentPreview,
    ContextDocumentResponse,
    ContextDocumentTextCreate,
    KnowledgeBaseCollection,
    KnowledgeBaseCollectionList,
)
from app.schemas.user import UserAdminOut, UserCreate, UserUpdate
from app.services.auth import hash_password
from app.services.document import DocumentService
from app.services.rag_service import RagService
from app.services.storage import delete as delete_storage, exists as storage_exists, read_bytes, save_context_document
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}


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


@router.delete("/users/{user_id}/permanently", status_code=204)
async def delete_user_permanently(user_id: str, db: DbDep, current_user: AdminUser):
    """Remove o usuário permanentemente do banco."""
    user = await UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Você não pode excluir seu próprio usuário.")
    await UserRepository.delete(db, user)
    await db.commit()


# ------------------------------------------------------------------ #
# Gerenciamento de Documentos de Contexto
# ------------------------------------------------------------------ #

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
    doc_id: str, storage_path: str, filename: str, collection: str = "prompt"
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
        Literal["prompt", "tr"],
        Form(),
    ] = "prompt",
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
        await delete_storage(doc.storage_path)

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

    if not await storage_exists(doc.storage_path):
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


@router.get("/context-documents/{doc_id}/preview", response_model=ContextDocumentPreview)
async def preview_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Retorna prévia do conteúdo de um documento de contexto."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage.",
        )

    if doc.mime_type == "application/pdf":
        return ContextDocumentPreview(
            type="pdf",
            download_url=f"/api/v1/admin/context-documents/{doc_id}/download",
        )

    PREVIEW_LIMIT = 3000

    if doc.mime_type == "text/plain":
        text = await asyncio.to_thread(
            Path(doc.storage_path).read_text, "utf-8"
        )
    else:
        file_bytes = await asyncio.to_thread(Path(doc.storage_path).read_bytes)
        text = await asyncio.to_thread(
            DocumentService.extract_text_sync, file_bytes, doc.filename
        )
        del file_bytes

    truncated = len(text) > PREVIEW_LIMIT
    return ContextDocumentPreview(
        type="text",
        text=text[:PREVIEW_LIMIT] if truncated else text,
        truncated=truncated,
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
