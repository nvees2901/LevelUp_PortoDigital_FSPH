"""
test_storage.py — Testes TDD para StorageService (Task 1)

Estratégia: injetar um FakeBucket diretamente em service._bucket,
impedindo qualquer conexão real com o GCS.

Ciclo TDD:
  RED   → rodar antes de criar storage.py (ImportError esperado)
  GREEN → rodar depois de criar storage.py (todos passam)
"""

import pytest
from google.cloud.exceptions import NotFound

from app.services.storage import StorageService


# ====================================================================== #
# Fakes in-memory para simular google.cloud.storage
# ====================================================================== #

class FakeBlob:
    """Simula google.cloud.storage.Blob — backed por dict compartilhado."""

    def __init__(self, name: str, store: dict[str, bytes]) -> None:
        self.name = name
        self._store = store

    def upload_from_string(self, data: bytes, content_type: str) -> None:
        self._store[self.name] = data

    def download_as_bytes(self) -> bytes:
        if self.name not in self._store:
            raise KeyError(f"Blob não encontrado: {self.name}")
        return self._store[self.name]

    def delete(self) -> None:
        if self.name not in self._store:
            # Mimics GCS NotFound — a implementação real deve engolir este erro
            raise NotFound(f"Object {self.name} not found")
        del self._store[self.name]

    def exists(self) -> bool:
        return self.name in self._store


class FakeBucket:
    """Simula google.cloud.storage.Bucket."""

    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}

    def blob(self, name: str) -> FakeBlob:
        return FakeBlob(name, self._store)


# ====================================================================== #
# Fixture: StorageService com bucket fake injetado
# ====================================================================== #

@pytest.fixture
def storage_service() -> StorageService:
    """StorageService com _bucket = FakeBucket (sem GCS real)."""
    svc = StorageService()
    svc._bucket = FakeBucket()
    return svc


# ====================================================================== #
# Testes
# ====================================================================== #

@pytest.mark.asyncio
async def test_upload_retorna_object_name(storage_service: StorageService) -> None:
    """upload() deve retornar o object_name exato passado como argumento."""
    result = await storage_service.upload(
        data=b"conteudo de teste",
        object_name="docs/termo.pdf",
        content_type="application/pdf",
    )
    assert result == "docs/termo.pdf"


@pytest.mark.asyncio
async def test_upload_e_download_roundtrip(storage_service: StorageService) -> None:
    """Bytes enviados via upload() devem ser recuperados via download()."""
    payload = b"PDF simulado com bytes especiais: \x00\xff\xfe"
    object_name = "termos/abc123.pdf"

    await storage_service.upload(data=payload, object_name=object_name, content_type="application/pdf")
    result = await storage_service.download(object_name)

    assert result == payload


@pytest.mark.asyncio
async def test_exists_retorna_true_apos_upload(storage_service: StorageService) -> None:
    """exists() deve retornar True para objeto recém-enviado."""
    await storage_service.upload(data=b"qualquer", object_name="foo/bar.docx", content_type="application/octet-stream")
    assert await storage_service.exists("foo/bar.docx") is True


@pytest.mark.asyncio
async def test_exists_retorna_false_para_objeto_inexistente(storage_service: StorageService) -> None:
    """exists() deve retornar False para objeto que nunca foi enviado."""
    assert await storage_service.exists("nao/existe.pdf") is False


@pytest.mark.asyncio
async def test_delete_remove_objeto(storage_service: StorageService) -> None:
    """Após delete(), exists() deve retornar False."""
    await storage_service.upload(data=b"dados", object_name="temp/file.txt", content_type="text/plain")
    assert await storage_service.exists("temp/file.txt") is True

    await storage_service.delete("temp/file.txt")
    assert await storage_service.exists("temp/file.txt") is False


@pytest.mark.asyncio
async def test_delete_silencioso_para_objeto_inexistente(storage_service: StorageService) -> None:
    """
    delete() de objeto inexistente NÃO deve propagar exceção.

    O FakeBlob.delete() lança Exception quando o objeto não existe,
    mimicando o comportamento do GCS (NotFound). O StorageService.delete()
    deve engolir este erro (equivalente a rm -f).
    """
    # Não deve lançar exceção
    await storage_service.delete("objeto/que/nao/existe.pdf")


@pytest.mark.asyncio
async def test_storage_service_singleton_importavel() -> None:
    """storage_service (instância singleton) deve ser importável do módulo."""
    from app.services.storage import storage_service

    assert storage_service is not None
    assert isinstance(storage_service, StorageService)


def test_gcs_bucket_no_settings() -> None:
    """settings.GCS_BUCKET deve existir e ter valor default."""
    from app.core.config import settings

    assert hasattr(settings, "GCS_BUCKET")
    assert settings.GCS_BUCKET == "fsph-uploads-2026"


def test_upload_dir_removido_do_settings() -> None:
    """UPLOAD_DIR não deve mais existir em settings (migrado para GCS)."""
    from app.core.config import settings

    assert not hasattr(settings, "UPLOAD_DIR"), (
        "UPLOAD_DIR ainda presente em settings — remover de config.py"
    )


def test_context_docs_dir_mantido_no_settings() -> None:
    """CONTEXT_DOCS_DIR deve permanecer em settings (usado por RagService)."""
    from app.core.config import settings

    assert hasattr(settings, "CONTEXT_DOCS_DIR")
    assert settings.CONTEXT_DOCS_DIR == "./context_documents"
