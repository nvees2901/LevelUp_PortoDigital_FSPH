"""
storage.py — Serviço de armazenamento no Google Cloud Storage

Encapsula o cliente GCS síncrono em métodos async via asyncio.to_thread.
Usa Application Default Credentials (ADC) — funciona automaticamente no Cloud Run.
"""
import asyncio
from app.core.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


class StorageService:
    """Cliente GCS lazy-initialized. Singleton via módulo."""

    def __init__(self) -> None:
        self._client = None
        self._bucket = None

    def _get_bucket(self):
        """Inicializa o cliente GCS na primeira chamada."""
        if self._bucket is None:
            from google.cloud import storage as gcs
            self._client = gcs.Client()
            self._bucket = self._client.bucket(settings.GCS_BUCKET)
        return self._bucket

    async def upload(self, data: bytes, object_name: str, content_type: str) -> str:
        """Faz upload de bytes para o GCS. Retorna o object_name."""
        def _upload():
            bucket = self._get_bucket()
            blob = bucket.blob(object_name)
            blob.upload_from_string(data, content_type=content_type)
        await asyncio.to_thread(_upload)
        logger.debug("GCS upload: %s (%d bytes)", object_name, len(data))
        return object_name

    async def download(self, object_name: str) -> bytes:
        """Baixa um objeto do GCS. Retorna os bytes."""
        def _download():
            bucket = self._get_bucket()
            blob = bucket.blob(object_name)
            return blob.download_as_bytes()
        result = await asyncio.to_thread(_download)
        logger.debug("GCS download: %s (%d bytes)", object_name, len(result))
        return result

    async def delete(self, object_name: str) -> None:
        """Remove um objeto do GCS. Silencioso se não existir."""
        def _delete():
            bucket = self._get_bucket()
            blob = bucket.blob(object_name)
            try:
                blob.delete()
            except Exception:
                pass  # silencioso — equivalente a rm -f
        await asyncio.to_thread(_delete)
        logger.debug("GCS delete: %s", object_name)

    async def exists(self, object_name: str) -> bool:
        """Verifica se um objeto existe no GCS."""
        def _exists():
            bucket = self._get_bucket()
            blob = bucket.blob(object_name)
            return blob.exists()
        return await asyncio.to_thread(_exists)


storage_service = StorageService()
