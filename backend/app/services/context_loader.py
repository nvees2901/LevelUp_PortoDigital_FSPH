"""
context_loader.py — Injeta a base de conhecimento do admin no prompt da IA
SEM depender de ChromaDB/RAG.

Lê os documentos de contexto ATIVOS de uma categoria (por padrão 'prompt'),
extrai o texto dos arquivos em storage_path e devolve um bloco de contexto
truncado para ser concatenado ao system prompt. Funciona com RAG desligado.
"""
from pathlib import Path

import anyio

from app.repositories.context_document import ContextDocumentRepository
from app.services.document import DocumentService
from app.utils.logging import get_logger

logger = get_logger(__name__)


async def load_context(db, collection: str = "prompt", max_chars: int = 4000, max_docs: int = 8) -> str:
    """Retorna o texto concatenado dos documentos ativos da categoria indicada
    (string vazia se não houver). Truncado em max_chars."""
    try:
        docs = await ContextDocumentRepository.list_all(db)
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao listar documentos de contexto: %s", e)
        return ""

    docs = [d for d in docs if d.collection == collection and getattr(d, "is_active", True)]
    if not docs:
        return ""
    docs.sort(key=lambda d: str(getattr(d, "uploaded_at", "")), reverse=True)

    parts: list[str] = []
    total = 0
    for d in docs[:max_docs]:
        try:
            path = Path(d.storage_path)
            if not path.exists():
                continue
            if d.filename.lower().endswith(".txt"):
                # Textos adicionados pelo admin são salvos como .txt — leitura direta.
                text = path.read_text(encoding="utf-8", errors="ignore")
            else:
                data = path.read_bytes()
                text = await anyio.to_thread.run_sync(DocumentService.extract_text_sync, data, d.filename)
        except Exception as e:  # noqa: BLE001
            logger.warning("Falha ao extrair contexto de %s: %s", d.filename, e)
            continue
        text = (text or "").strip()
        if not text:
            continue
        chunk = f"### {getattr(d, 'original_filename', None) or d.filename}\n{text}"
        if total + len(chunk) > max_chars:
            chunk = chunk[: max(0, max_chars - total)]
        if not chunk:
            break
        parts.append(chunk)
        total += len(chunk)
        if total >= max_chars:
            break

    if not parts:
        return ""
    return (
        "DOCUMENTOS DE CONTEXTO (base de conhecimento da FSPH — use como apoio):\n\n"
        + "\n\n".join(parts)
    )
