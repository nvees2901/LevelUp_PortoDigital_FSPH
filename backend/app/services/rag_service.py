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

import asyncio
import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.config import settings
from app.utils.logging import get_logger

if TYPE_CHECKING:
    import chromadb

def _extract_pdf_text(file_path: Path) -> str:
    """
    Extrai texto de PDF com pypdf (rápido, baixo uso de memória).
    Usado exclusivamente para indexação RAG — não precisa de layout de tabelas.
    """
    from pypdf import PdfReader
    reader = PdfReader(str(file_path))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)

logger = get_logger(__name__)


class RagService:
    """Serviço singleton de RAG. Conecta ao ChromaDB server via HTTP."""

    _client: "chromadb.ClientAPI | None" = None
    _indexing_lock = threading.Lock()  # evita indexação simultânea dentro do mesmo processo

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #

    @classmethod
    def setup(cls) -> None:
        """
        Conecta ao ChromaDB server via HTTP.
        Não carrega nenhum modelo localmente — embeddings são gerados no server.
        """
        if not settings.RAG_ENABLED:
            return
        if cls._client is not None:
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
        logger.info("✓ Conectado ao ChromaDB server")

    @classmethod
    def index_documents(cls, docs_path: str | None = None) -> None:
        """
        Garante que as três coleções ChromaDB existem.
        A indexação dos seeds agora é responsabilidade de import_seed_documents().
        """
        with cls._indexing_lock:
            if cls._client is None:
                cls.setup()
            cls._client.get_or_create_collection(name="lei_14133")
            cls._client.get_or_create_collection(name="termos_aprovados")
            cls._client.get_or_create_collection(name="context_extra")
            logger.info("✓ Coleções ChromaDB garantidas")

    @classmethod
    async def import_seed_documents(cls, db) -> None:
        """
        Importa os arquivos de documents/ para a tabela context_documents e indexa no ChromaDB.

        Idempotente via marcador JSON em {CONTEXT_DOCS_DIR}/.seeds_imported.
        Semântica de coleção por nome de arquivo: "14133" ou "Lei" → lei_14133, resto → termos_aprovados.
        O limite MAX_FILE_SIZE_MB é ignorado para seeds (conteúdo institucional confiável).
        """
        import json

        from app.models.context_document import ContextDocument
        from app.repositories.context_document import ContextDocumentRepository

        if not settings.RAG_ENABLED:
            logger.info("RAG desabilitado — seeds não importados")
            return

        if cls._client is None:
            await asyncio.to_thread(cls.setup)

        docs_dir = Path(settings.DOCS_PATH)
        if not docs_dir.exists():
            logger.warning("Pasta de seeds não encontrada: %s", docs_dir.resolve())
            return

        context_dir = Path(settings.CONTEXT_DOCS_DIR)
        context_dir.mkdir(parents=True, exist_ok=True)
        marker_path = context_dir / ".seeds_imported"

        imported: list[str] = []
        if marker_path.exists():
            try:
                imported = json.loads(marker_path.read_text())
            except Exception:
                imported = []

        # Normaliza o conjunto de arquivos já processados (inclui entradas "FAILED:nome")
        # para evitar que um arquivo que crashou o processo seja re-tentado no próximo boot.
        processed_filenames: set[str] = {
            e[len("FAILED:"):] if e.startswith("FAILED:") else e
            for e in imported
        }

        for file_path in sorted(docs_dir.iterdir()):
            if file_path.name.startswith(".") or file_path.name == ".gitkeep":
                continue
            if file_path.suffix.lower() not in {".pdf", ".docx", ".doc"}:
                continue
            if file_path.name in processed_filenames:
                continue

            filename = file_path.name
            if "14133" in filename or "Lei" in filename:
                collection = "lei_14133"
            else:
                collection = "termos_aprovados"

            logger.info("Importando seed: %s → %s", filename, collection)
            size_bytes = file_path.stat().st_size
            mime = "application/pdf" if file_path.suffix.lower() == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

            # Reusar linha existente se o container crashou antes do commit do marker
            doc = await ContextDocumentRepository.get_seed_by_filename(db, filename)
            if doc is None:
                doc = await ContextDocumentRepository.create(db, {
                    "filename": filename,
                    "original_filename": filename,
                    "mime_type": mime,
                    "size_bytes": size_bytes,
                    "storage_path": str(file_path),
                    "uploaded_by_id": None,
                    "collection": collection,
                    "is_seed": True,
                    "status": "pending",
                })
            else:
                await ContextDocumentRepository.mark_pending(db, doc)
            await db.commit()

            try:
                # Indexar sem limite de tamanho
                target_collection = await asyncio.to_thread(
                    lambda c=collection: cls._client.get_or_create_collection(name=c)
                )

                if file_path.suffix.lower() == ".pdf":
                    text = await asyncio.to_thread(_extract_pdf_text, file_path)
                else:
                    file_bytes = await asyncio.to_thread(file_path.read_bytes)
                    from app.services.document import DocumentService
                    text = await asyncio.to_thread(
                        DocumentService.extract_text_sync, file_bytes, filename
                    )
                    del file_bytes  # libera antes do pico de memória do modelo ONNX

                chunks = cls._chunk_text(text, filename)
                del text  # release before ONNX model loads
                if chunks:
                    import gc; gc.collect()
                    await asyncio.to_thread(cls._remove_chunks_from_collection, target_collection, filename)
                    await asyncio.to_thread(cls._add_to_collection, target_collection, chunks)

                await ContextDocumentRepository.mark_indexed(db, doc, len(chunks))
                await db.commit()
                logger.info("  ✓ Seed indexado: %s (%d chunks)", filename, len(chunks))

                # Grava marcador APÓS commit bem-sucedido para garantir idempotência
                imported.append(filename)
                processed_filenames.add(filename)
                marker_path.write_text(json.dumps(imported))
            except Exception as e:
                await ContextDocumentRepository.mark_failed(db, doc, str(e))
                await db.commit()
                logger.error("  ✗ Falha ao indexar seed %s: %s", filename, e)

                # Marca como falhou para não re-tentar no próximo boot (evita crash-loop)
                imported.append(f"FAILED:{filename}")
                processed_filenames.add(filename)
                marker_path.write_text(json.dumps(imported))

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
        if not settings.RAG_ENABLED:
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
        extra_context = cls._search("context_extra", query, top_k=3, label="Contexto Adicional")

        parts = []
        if law_context:
            parts.append(law_context)
        if tr_context:
            parts.append(tr_context)
        if extra_context:
            parts.append(extra_context)

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
            end = start + settings.RAG_CHUNK_SIZE

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
            start = end - settings.RAG_CHUNK_OVERLAP

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

        BATCH_SIZE = 50

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

    @classmethod
    def _remove_chunks_from_collection(cls, collection, filename: str) -> None:
        """Remove todos os chunks de um arquivo específico de uma coleção ChromaDB."""
        try:
            results = collection.get(where={"source": filename})
            if results and results.get("ids"):
                collection.delete(ids=results["ids"])
                logger.info("Removidos %d chunks de '%s'", len(results["ids"]), filename)
        except Exception as e:
            logger.warning("Erro ao remover chunks de '%s': %s", filename, e)

    @classmethod
    def remove_document_chunks(cls, filename: str, collection: str = "context_extra") -> None:
        """Remove chunks de um documento da coleção informada."""
        if not settings.RAG_ENABLED:
            return
        if cls._client is None:
            logger.warning("ChromaDB não inicializado — não foi possível remover chunks de '%s'", filename)
            return
        try:
            col = cls._client.get_collection(collection)
            cls._remove_chunks_from_collection(col, filename)
        except Exception as e:
            logger.warning("Erro ao acessar coleção '%s': %s", collection, e)

    @classmethod
    async def index_uploaded_document(
        cls, storage_path: str, filename: str, collection: str = "context_extra"
    ) -> int:
        """Indexa um documento de contexto na coleção informada."""
        if not settings.RAG_ENABLED:
            logger.info("RAG desabilitado — pulando indexação de '%s'", filename)
            return 0
        if cls._client is None:
            await asyncio.to_thread(cls.setup)

        target_collection = await asyncio.to_thread(
            lambda: cls._client.get_or_create_collection(name=collection)
        )

        file_path = Path(storage_path)

        if file_path.suffix.lower() == ".txt":
            text = await asyncio.to_thread(
                lambda: file_path.read_text(encoding="utf-8")
            )
        elif file_path.suffix.lower() == ".pdf":
            text = await asyncio.to_thread(_extract_pdf_text, file_path)
        else:
            file_bytes = await asyncio.to_thread(file_path.read_bytes)
            from app.services.document import DocumentService
            text = await asyncio.to_thread(
                DocumentService.extract_text_sync, file_bytes, filename
            )
            del file_bytes  # libera antes do pico de memória do modelo ONNX

        chunks = cls._chunk_text(text, filename)
        del text  # release before ONNX model loads
        if not chunks:
            return 0
        import gc; gc.collect()

        # Remove chunks antigos deste arquivo (evita duplicatas em re-indexação)
        await asyncio.to_thread(cls._remove_chunks_from_collection, target_collection, filename)

        await asyncio.to_thread(cls._add_to_collection, target_collection, chunks)
        return len(chunks)

    @classmethod
    def get_collections_stats(cls) -> list[dict]:
        """Retorna estatísticas das 3 coleções ChromaDB (read-only e gerenciável pelo admin)."""
        collections_meta = [
            {
                "name": "lei_14133",
                "display_name": "Lei 14.133/2021",
                "description": "Nova Lei de Licitações e Contratos Administrativos — base legal para análise de TRs",
                "is_readonly": False,
            },
            {
                "name": "termos_aprovados",
                "display_name": "Termos de Referência Aprovados",
                "description": "TRs pré-aprovados da FSPH usados como exemplos de referência pelo assistente IA",
                "is_readonly": False,
            },
            {
                "name": "context_extra",
                "display_name": "Documentos Adicionais (Admin)",
                "description": "Documentos de contexto carregados pelo administrador para enriquecer as respostas da IA",
                "is_readonly": False,
            },
        ]

        results = []
        for meta in collections_meta:
            chunks_count: int | None = None
            if cls._client is not None:
                try:
                    col = cls._client.get_or_create_collection(name=meta["name"])
                    chunks_count = col.count()
                except Exception as e:
                    logger.warning("Erro ao contar chunks da coleção '%s': %s", meta["name"], e)
            results.append({**meta, "chunks_count": chunks_count})

        return results
