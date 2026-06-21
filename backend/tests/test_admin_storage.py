"""
test_admin_storage.py — Testes TDD para migração de context documents para GCS (Task 2)

RED phase: testes escritos ANTES das mudanças em admin.py.
As mudanças vão fazer esses testes passarem (GREEN).

Estratégia: chamar funções/handlers diretamente para evitar DB real e background tasks.
"""

import asyncio
import io
import types
import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.api.routes.admin as admin_module


# ======================================================================== #
# Fixtures auxiliares
# ======================================================================== #

@pytest.fixture
def patched_storage(fake_storage, monkeypatch):
    """Injeta o FakeStorageService no módulo admin, substituindo o storage_service real."""
    monkeypatch.setattr(admin_module, "storage_service", fake_storage)
    return fake_storage


def make_doc(**kwargs):
    """Cria um objeto ContextDocument fake com os campos necessários."""
    defaults = {
        "id": uuid.uuid4(),
        "filename": "arquivo.txt",
        "original_filename": "documento.txt",
        "mime_type": "text/plain",
        "size_bytes": 100,
        "storage_path": "context_documents/arquivo.txt",
        "is_seed": False,
        "is_active": True,
        "status": "indexed",
        "collection": "context_extra",
        "chunks_count": 5,
        "error_message": None,
        "indexed_at": datetime.now(),
        "uploaded_at": datetime.now(),
        "uploaded_by_id": uuid.uuid4(),
    }
    defaults.update(kwargs)
    obj = types.SimpleNamespace(**defaults)
    return obj


# ======================================================================== #
# Teste 1: _doc_exists retorna False para non-seed quando GCS não tem o objeto
# ======================================================================== #

@pytest.mark.asyncio
async def test_doc_exists_non_seed_not_in_gcs(patched_storage):
    """_doc_exists deve retornar False para doc non-seed quando objeto não existe no GCS."""
    doc = make_doc(is_seed=False, storage_path="context_documents/nao_existe.txt")

    result = await admin_module._doc_exists(doc)

    assert result is False


# ======================================================================== #
# Teste 2: _doc_exists retorna True para is_seed quando o path local existe
# ======================================================================== #

@pytest.mark.asyncio
async def test_doc_exists_seed_local_file(tmp_path, monkeypatch, patched_storage):
    """_doc_exists deve retornar True para doc is_seed quando o arquivo local existe."""
    local_file = tmp_path / "seed_doc.txt"
    local_file.write_bytes(b"conteudo do seed")

    doc = make_doc(is_seed=True, storage_path=str(local_file))

    result = await admin_module._doc_exists(doc)

    assert result is True


# ======================================================================== #
# Teste 3: _load_doc_bytes retorna bytes do GCS para non-seed
# ======================================================================== #

@pytest.mark.asyncio
async def test_load_doc_bytes_non_seed(patched_storage):
    """_load_doc_bytes deve baixar bytes do GCS para doc non-seed."""
    content = b"conteudo do documento"
    object_name = "context_documents/doc.txt"
    await patched_storage.upload(content, object_name, "text/plain")

    doc = make_doc(is_seed=False, storage_path=object_name)

    result = await admin_module._load_doc_bytes(doc)

    assert result == content


# ======================================================================== #
# Teste 4: _load_doc_bytes lê do disco para seed
# ======================================================================== #

@pytest.mark.asyncio
async def test_load_doc_bytes_seed_local(tmp_path, patched_storage):
    """_load_doc_bytes deve ler bytes do path local para doc is_seed."""
    content = b"conteudo do seed local"
    local_file = tmp_path / "seed.txt"
    local_file.write_bytes(content)

    doc = make_doc(is_seed=True, storage_path=str(local_file))

    result = await admin_module._load_doc_bytes(doc)

    assert result == content


# ======================================================================== #
# Teste 5: Upload POST → storage_service.upload chamado; storage_path contem "context_documents/"
# ======================================================================== #

@pytest.mark.asyncio
async def test_upload_calls_storage_and_path_contains_context_documents(patched_storage, monkeypatch):
    """Upload handler deve chamar storage_service.upload e o storage_path deve conter 'context_documents/'."""
    from fastapi import BackgroundTasks
    from unittest.mock import AsyncMock

    # Fake UploadFile
    fake_file = MagicMock()
    fake_file.filename = "teste.txt"
    fake_file.content_type = "text/plain"
    file_content = b"conteudo do arquivo"
    fake_file.read = AsyncMock(return_value=file_content)

    # Fake current_user
    fake_user = MagicMock()
    fake_user.id = uuid.uuid4()

    # Fake DB
    created_doc = make_doc(
        filename="uuid-gerado.txt",
        original_filename="teste.txt",
        mime_type="text/plain",
        size_bytes=len(file_content),
        storage_path="context_documents/uuid-gerado.txt",
        is_seed=False,
    )

    async def fake_create(db, data):
        return created_doc

    async def fake_commit():
        pass

    async def fake_refresh(obj):
        pass

    fake_db = MagicMock()
    fake_db.commit = AsyncMock()
    fake_db.refresh = AsyncMock()

    monkeypatch.setattr("app.repositories.context_document.ContextDocumentRepository.create", fake_create)
    # background_tasks não vai rodar em chamada direta
    bg_tasks = BackgroundTasks()

    with patch.object(admin_module, "settings") as mock_settings:
        mock_settings.CONTEXT_DOC_MAX_SIZE_MB = 10
        mock_settings.CONTEXT_DOCS_DIR = "/tmp/context_docs"

        response = await admin_module.upload_context_document(
            file=fake_file,
            background_tasks=bg_tasks,
            db=fake_db,
            current_user=fake_user,
            collection="context_extra",
        )

    # Verifica que storage_service.upload foi chamado
    assert len(patched_storage._storage) == 1
    stored_key = list(patched_storage._storage.keys())[0]
    assert "context_documents/" in stored_key
    assert patched_storage._storage[stored_key] == file_content


# ======================================================================== #
# Teste 6: Download GET non-seed → StreamingResponse com bytes do GCS
# ======================================================================== #

@pytest.mark.asyncio
async def test_download_non_seed_returns_streaming_response(patched_storage, monkeypatch):
    """Download de doc non-seed deve retornar StreamingResponse com bytes do GCS."""
    from fastapi.responses import StreamingResponse

    content = b"conteudo para download"
    object_name = "context_documents/doc.txt"
    await patched_storage.upload(content, object_name, "text/plain")

    doc = make_doc(
        is_seed=False,
        storage_path=object_name,
        mime_type="text/plain",
        original_filename="documento.txt",
    )

    async def fake_get_by_id(db, doc_id):
        return doc

    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.get_by_id",
        fake_get_by_id,
    )

    fake_db = MagicMock()
    fake_user = MagicMock()

    response = await admin_module.download_context_document(
        doc_id=str(doc.id),
        db=fake_db,
        current_user=fake_user,
    )

    assert isinstance(response, StreamingResponse)
    # Lê o conteúdo da resposta
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk)
        else:
            chunks.append(chunk.encode())
    body = b"".join(chunks)
    assert body == content


# ======================================================================== #
# Teste 7: Download GET seed → bytes lidos do path local
# ======================================================================== #

@pytest.mark.asyncio
async def test_download_seed_reads_local_file(tmp_path, patched_storage, monkeypatch):
    """Download de doc is_seed deve ler o arquivo local e retornar StreamingResponse."""
    from fastapi.responses import StreamingResponse

    content = b"conteudo seed local"
    local_file = tmp_path / "seed.txt"
    local_file.write_bytes(content)

    doc = make_doc(
        is_seed=True,
        storage_path=str(local_file),
        mime_type="text/plain",
        original_filename="seed.txt",
    )

    async def fake_get_by_id(db, doc_id):
        return doc

    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.get_by_id",
        fake_get_by_id,
    )

    fake_db = MagicMock()
    fake_user = MagicMock()

    response = await admin_module.download_context_document(
        doc_id=str(doc.id),
        db=fake_db,
        current_user=fake_user,
    )

    assert isinstance(response, StreamingResponse)
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk)
        else:
            chunks.append(chunk.encode())
    body = b"".join(chunks)
    assert body == content


# ======================================================================== #
# Teste 8: Download retorna 410 quando arquivo não existe (non-seed)
# ======================================================================== #

@pytest.mark.asyncio
async def test_download_returns_410_when_not_in_gcs(patched_storage, monkeypatch):
    """Download deve retornar 410 quando o objeto não existe no GCS (non-seed)."""
    from fastapi import HTTPException

    doc = make_doc(
        is_seed=False,
        storage_path="context_documents/nao_existe.txt",
        mime_type="text/plain",
        original_filename="nao_existe.txt",
    )

    async def fake_get_by_id(db, doc_id):
        return doc

    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.get_by_id",
        fake_get_by_id,
    )

    fake_db = MagicMock()
    fake_user = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await admin_module.download_context_document(
            doc_id=str(doc.id),
            db=fake_db,
            current_user=fake_user,
        )

    assert exc_info.value.status_code == 410


# ======================================================================== #
# Teste 9: Delete non-seed → storage_service.delete chamado
# ======================================================================== #

@pytest.mark.asyncio
async def test_delete_non_seed_calls_storage_delete(patched_storage, monkeypatch):
    """Delete de doc non-seed deve chamar storage_service.delete."""
    content = b"arquivo para deletar"
    object_name = "context_documents/deletar.txt"
    await patched_storage.upload(content, object_name, "text/plain")

    doc = make_doc(is_seed=False, storage_path=object_name)

    async def fake_get_by_id(db, doc_id):
        return doc

    async def fake_delete(db, obj):
        pass

    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.get_by_id",
        fake_get_by_id,
    )
    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.delete",
        fake_delete,
    )

    # Mock RagService.remove_document_chunks (síncrona, chamada via asyncio.to_thread)
    with patch.object(admin_module.RagService, "remove_document_chunks", return_value=None):
        fake_db = MagicMock()
        fake_db.commit = AsyncMock()
        fake_user = MagicMock()

        await admin_module.delete_context_document(
            doc_id=str(doc.id),
            db=fake_db,
            current_user=fake_user,
        )

    # Verifica que o objeto foi removido do storage
    assert not await patched_storage.exists(object_name)


# ======================================================================== #
# Teste 10: Delete seed → storage_service.delete NÃO chamado
# ======================================================================== #

@pytest.mark.asyncio
async def test_delete_seed_does_not_call_storage_delete(patched_storage, monkeypatch):
    """Delete de doc is_seed não deve chamar storage_service.delete."""
    doc = make_doc(is_seed=True, storage_path="/app/docs/seed.txt")

    # Pré-popular storage com algo para garantir que nada é removido dele
    await patched_storage.upload(b"outro", "context_documents/outro.txt", "text/plain")

    storage_items_before = set(patched_storage._storage.keys())

    async def fake_get_by_id(db, doc_id):
        return doc

    async def fake_delete(db, obj):
        pass

    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.get_by_id",
        fake_get_by_id,
    )
    monkeypatch.setattr(
        "app.repositories.context_document.ContextDocumentRepository.delete",
        fake_delete,
    )

    with patch.object(admin_module.RagService, "remove_document_chunks", return_value=None):
        fake_db = MagicMock()
        fake_db.commit = AsyncMock()
        fake_user = MagicMock()

        await admin_module.delete_context_document(
            doc_id=str(doc.id),
            db=fake_db,
            current_user=fake_user,
        )

    # Itens no storage devem ser os mesmos — nenhuma remoção do GCS para seeds
    storage_items_after = set(patched_storage._storage.keys())
    assert storage_items_before == storage_items_after
