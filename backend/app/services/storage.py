import asyncio
import io
import uuid
from pathlib import Path
from typing import Tuple

import aiofiles

from app.core.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


def _is_gcs_path(path: str) -> bool:
    return path.strip().lower().startswith("gs://")


def _parse_gcs_path(path: str) -> Tuple[str, str]:
    path = path.strip()
    if not path.lower().startswith("gs://"):
        raise ValueError("Expected a gs:// path")

    without_schema = path[5:]
    if "/" not in without_schema:
        raise ValueError(f"Invalid GCS path: {path}")

    bucket, blob_name = without_schema.split("/", 1)
    return bucket, blob_name


def _gcs_client():
    from google.cloud import storage

    return storage.Client()


def _normalize_prefix(prefix: str) -> str:
    return prefix.strip("/") if prefix else ""


async def _save_bytes(file_bytes: bytes, prefix: str, filename: str, local_dir: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    blob_name = f"{_normalize_prefix(prefix)}/{unique_name}" if prefix else unique_name

    if settings.GCS_BUCKET:
        client = _gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(blob_name)
        await asyncio.to_thread(blob.upload_from_string, file_bytes)
        logger.info("Saved file to GCS: gs://%s/%s", settings.GCS_BUCKET, blob_name)
        return f"gs://{settings.GCS_BUCKET}/{blob_name}"

    local_path = Path(local_dir) / unique_name
    local_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(local_path, "wb") as f:
        await f.write(file_bytes)
    return str(local_path)


async def save_upload(file_bytes: bytes, filename: str) -> str:
    return await _save_bytes(file_bytes, settings.GCS_UPLOAD_PREFIX, filename, settings.UPLOAD_DIR)


async def save_context_document(file_bytes: bytes, filename: str) -> str:
    return await _save_bytes(
        file_bytes,
        settings.GCS_CONTEXT_DOCS_PREFIX,
        filename,
        settings.CONTEXT_DOCS_DIR,
    )


async def delete(path: str) -> None:
    path = path.strip()
    if _is_gcs_path(path):
        bucket_name, blob_name = _parse_gcs_path(path)
        client = _gcs_client()
        blob = client.bucket(bucket_name).blob(blob_name)
        await asyncio.to_thread(blob.delete)
        return

    await asyncio.to_thread(Path(path).unlink, missing_ok=True)


async def exists(path: str) -> bool:
    path = path.strip()
    if _is_gcs_path(path):
        bucket_name, blob_name = _parse_gcs_path(path)
        client = _gcs_client()
        blob = client.bucket(bucket_name).blob(blob_name)
        return await asyncio.to_thread(blob.exists)

    return Path(path).exists()


async def read_bytes(path: str) -> bytes:
    path = path.strip()
    if _is_gcs_path(path):
        bucket_name, blob_name = _parse_gcs_path(path)
        client = _gcs_client()
        blob = client.bucket(bucket_name).blob(blob_name)
        return await asyncio.to_thread(blob.download_as_bytes)

    async with aiofiles.open(path, "rb") as f:
        return await f.read()


async def open_stream(path: str):
    """Retorna um stream em memória para download em HTTP."""
    return io.BytesIO(await read_bytes(path))
