"""
rag_service.py — Serviço de RAG com ChromaDB Server (Docker)

Pipeline:
  1. Na inicialização: conecta ao ChromaDB via HTTP e indexa docs de /docs
  2. Em cada query: busca semântica e retorna trechos relevantes

O ChromaDB server gera embeddings internamente (all-MiniLM-L6-v2),
eliminando a necessidade de PyTorch/sentence-transformers no backend.

Coleções ChromaDB:
  - "lei_14133"        → chunks da Lei 14.133/2021 (base legal)
  - "termos_aprovados"  → TRs pré-aprovados da FSPH (exemplos de referência)
"""

import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.config import settings
from app.utils.logging import get_logger

if TYPE_CHECKING:
    import chromadb

logger = get_logger(__name__)

CHUNK_SIZE = 1500      # ~375 tokens
CHUNK_OVERLAP = 200    # overlap para não perder contexto nas bordas


class RagService:
    """Serviço singleton de RAG. Conecta ao ChromaDB server via HTTP."""

    _client: "chromadb.ClientAPI | None" = None
    _indexed: bool = False
    _setup_done: bool = False
    _indexing_lock = threading.Lock()  # evita indexação simultânea

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #

    @classmethod
    def setup(cls) -> None:
        """
        Conecta ao ChromaDB server via HTTP.
        Não carrega nenhum modelo localmente — embeddings são gerados no server.
        """
        if cls._setup_done:
            return

        import chromadb

        logger.info(
            "Conectando ao ChromaDB server em %s:%s",
            settings.CHROMA_HOST,
            settings.CHROMA_PORT,
        )

        cls._client = chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
        )

        # Verifica conexão
        cls._client.heartbeat()
        cls._setup_done = True
        logger.info("✓ Conectado ao ChromaDB server")

    @classmethod
    def index_documents(cls, docs_path: str | None = None) -> None:
        """
        Indexa todos os documentos da pasta /docs no ChromaDB.
        Se os documentos já estiverem indexados, não re-indexa.
        Thread-safe via lock.
        """
        if cls._indexed:
            return

        with cls._indexing_lock:
            # Double-check após adquirir o lock
            if cls._indexed:
                return

            if cls._client is None:
                cls.setup()

            docs_dir = Path(docs_path or settings.DOCS_PATH)
            if not docs_dir.exists():
                logger.warning("Pasta /docs não encontrada: %s", docs_dir.resolve())
                return

            # Cria ou carrega coleções
            lei_collection = cls._client.get_or_create_collection(
                name="lei_14133",
                metadata={"description": "Lei 14.133/2021 — Nova Lei de Licitações"},
            )
            tr_collection = cls._client.get_or_create_collection(
                name="termos_aprovados",
                metadata={"description": "TRs pré-aprovados da FSPH"},
            )

            # Verifica se já foi indexado
            if lei_collection.count() > 0 and tr_collection.count() > 0:
                logger.info(
                    "✓ ChromaDB já indexado: %d chunks lei | %d chunks TRs",
                    lei_collection.count(), tr_collection.count(),
                )
                cls._indexed = True
                return

            # Indexa os documentos
            lei_indexed = 0
            tr_indexed = 0

            MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

            for file_path in docs_dir.iterdir():
                if file_path.name == ".gitkeep":
                    continue

                filename = file_path.name
                file_size = file_path.stat().st_size

                if file_size > MAX_FILE_SIZE:
                    logger.warning(
                        "Pulando %s (%.1f MB) — excede limite de %d MB para indexação",
                        filename, file_size / 1024 / 1024, MAX_FILE_SIZE // 1024 // 1024,
                    )
                    continue

                logger.info("Indexando: %s", filename)

                try:
                    file_bytes = file_path.read_bytes()
                    from app.services.document import DocumentService
                    text = DocumentService.extract_text_sync(file_bytes, filename)

                    if "14133" in filename or "Lei" in filename:
                        chunks = cls._chunk_text(text, filename)
                        cls._add_to_collection(lei_collection, chunks)
                        lei_indexed += len(chunks)
                        logger.info("  ✓ Lei indexada: %d chunks", len(chunks))
                    else:
                        chunks = cls._chunk_text(text, filename)
                        cls._add_to_collection(tr_collection, chunks)
                        tr_indexed += len(chunks)
                        logger.info("  ✓ TR indexado: %d chunks", len(chunks))

                except Exception as e:
                    logger.error("Erro ao indexar %s: %s", filename, e)

            logger.info(
                "✓ Indexação concluída: %d chunks da lei | %d chunks de TRs",
                lei_indexed, tr_indexed,
            )
            cls._indexed = True

    # ------------------------------------------------------------------ #
    # Busca semântica
    # ------------------------------------------------------------------ #

    @classmethod
    def search_law(cls, query: str, top_k: int = 4) -> str:
        """Busca trechos relevantes da Lei 14.133/2021."""
        return cls._search("lei_14133", query, top_k, "Lei 14.133/2021")

    @classmethod
    def search_approved_terms(cls, query: str, top_k: int = 3) -> str:
        """Busca trechos de TRs pré-aprovados da FSPH como referência."""
        return cls._search("termos_aprovados", query, top_k, "TRs Aprovados FSPH")

    @classmethod
    def ensure_indexed(cls) -> None:
        """Garante que os documentos foram indexados (lazy — só na primeira busca)."""
        if cls._indexed:
            return
        if cls._client is None:
            cls.setup()
        cls.index_documents()

    @classmethod
    def get_full_context(cls, query: str) -> str:
        """Retorna contexto completo: trechos da lei + TRs de referência."""
        if not settings.RAG_ENABLED:
            return ""

        try:
            cls.ensure_indexed()
        except Exception as e:
            logger.warning("RAG indisponível: %s", e)
            return ""

        law_context = cls.search_law(query, top_k=4)
        tr_context = cls.search_approved_terms(query, top_k=2)

        parts = []
        if law_context:
            parts.append(law_context)
        if tr_context:
            parts.append(tr_context)

        return "\n\n".join(parts)

    # ------------------------------------------------------------------ #
    # Utilitários internos
    # ------------------------------------------------------------------ #

    @classmethod
    def _search(
        cls,
        collection_name: str,
        query: str,
        top_k: int,
        label: str,
    ) -> str:
        """Executa busca semântica — embeddings gerados pelo ChromaDB server."""
        if cls._client is None:
            return ""
        try:
            collection = cls._client.get_collection(collection_name)
            if collection.count() == 0:
                return ""

            # query_texts faz o ChromaDB server gerar o embedding automaticamente
            results = collection.query(
                query_texts=[query],
                n_results=min(top_k, collection.count()),
                include=["documents", "metadatas"],
            )

            if not results["documents"] or not results["documents"][0]:
                return ""

            chunks = results["documents"][0]
            metadatas = results["metadatas"][0]

            formatted = [f"### Contexto — {label}"]
            for i, (chunk, meta) in enumerate(zip(chunks, metadatas), 1):
                source = meta.get("source", "")
                formatted.append(f"[{i}] {chunk.strip()}")
                if source:
                    formatted.append(f"   *(Fonte: {source})*")

            return "\n".join(formatted)

        except Exception as e:
            logger.warning("Erro na busca RAG (%s): %s", collection_name, e)
            return ""

    @classmethod
    def _chunk_text(cls, text: str, source: str) -> list[dict]:
        """Divide o texto em chunks com overlap."""
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)

        chunks = []
        start = 0
        chunk_idx = 0

        while start < len(text):
            end = start + CHUNK_SIZE

            if end < len(text):
                break_pos = text.rfind("\n\n", start, end)
                if break_pos == -1:
                    break_pos = text.rfind(". ", start, end)
                if break_pos != -1 and break_pos > start:
                    end = break_pos + 1

            chunk_text = text[start:end].strip()
            if len(chunk_text) > 50:
                chunks.append({
                    "text": chunk_text,
                    "source": source,
                    "chunk_index": chunk_idx,
                })
            chunk_idx += 1
            start = end - CHUNK_OVERLAP

        return chunks

    @classmethod
    def _add_to_collection(
        cls,
        collection: "chromadb.Collection",
        chunks: list[dict],
    ) -> None:
        """Adiciona chunks ao ChromaDB — server gera embeddings automaticamente."""
        if not chunks:
            return

        BATCH_SIZE = 100

        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i:i + BATCH_SIZE]
            texts = [c["text"] for c in batch]
            ids = [f"{c['source']}_{c['chunk_index']}" for c in batch]
            metadatas = [{"source": c["source"], "chunk_index": c["chunk_index"]}
                         for c in batch]

            # Sem passar embeddings — ChromaDB server gera automaticamente
            collection.add(
                ids=ids,
                documents=texts,
                metadatas=metadatas,
            )
            logger.debug("Lote indexado: %d/%d chunks", i + len(batch), len(chunks))
