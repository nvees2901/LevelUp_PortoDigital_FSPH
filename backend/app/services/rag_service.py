"""
rag_service.py — Serviço de RAG com ChromaDB + sentence-transformers

Pipeline:
  1. Na inicialização: indexa todos os docs de /docs no ChromaDB
  2. Em cada query: busca semântica e retorna trechos relevantes

Coleções ChromaDB:
  - "lei_14133"      → chunks da Lei 14.133/2021 (base legal)
  - "termos_aprovados" → TRs pré-aprovados da FSPH (exemplos de referência)
"""

import os
import re
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.services.document import DocumentService
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Modelo multilíngue compacto — suporte nativo PT-BR, ~120MB
EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

CHUNK_SIZE = 1500      # ~375 tokens (seguro para o modelo MiniLM)
CHUNK_OVERLAP = 200    # overlap para não perder contexto nas bordas


class RagService:
    """Serviço singleton de RAG. Inicializado no startup do FastAPI."""

    _client: chromadb.ClientAPI | None = None
    _embedder: SentenceTransformer | None = None
    _indexed: bool = False

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #

    @classmethod
    def setup(cls) -> None:
        """
        Inicializa o ChromaDB e o modelo de embedding.
        Chamado UMA VEZ no startup do servidor (lifespan).
        """
        logger.info("Inicializando ChromaDB em: %s", settings.CHROMA_DB_PATH)
        os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)

        cls._client = chromadb.PersistentClient(
            path=settings.CHROMA_DB_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )

        logger.info("Carregando modelo de embedding: %s", EMBEDDING_MODEL)
        # O modelo é baixado automaticamente na 1ª execução (~120MB)
        cls._embedder = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("✓ Modelo de embedding carregado")

    @classmethod
    def index_documents(cls, docs_path: str | None = None) -> None:
        """
        Indexa todos os documentos da pasta /docs no ChromaDB.
        Se os documentos já estiverem indexados, não re-indexa.
        """
        if cls._client is None or cls._embedder is None:
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

        for file_path in docs_dir.iterdir():
            if file_path.name == ".gitkeep":
                continue

            filename = file_path.name
            logger.info("Indexando: %s", filename)

            try:
                file_bytes = file_path.read_bytes()
                # Extrai texto usando o DocumentService existente
                # Chamada síncrona direta — extract_text não usa await internamente
                text = DocumentService.extract_text_sync(file_bytes, filename)

                if "14133" in filename or "Lei" in filename:
                    # É a lei → indexa na coleção lei_14133
                    chunks = cls._chunk_text(text, filename)
                    cls._add_to_collection(lei_collection, chunks)
                    lei_indexed += len(chunks)
                    logger.info("  ✓ Lei indexada: %d chunks", len(chunks))
                else:
                    # É um TR aprovado → indexa em termos_aprovados
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
        """
        Busca trechos relevantes da Lei 14.133/2021.
        Retorna texto formatado pronto para injetar no prompt.
        """
        return cls._search("lei_14133", query, top_k, "Lei 14.133/2021")

    @classmethod
    def search_approved_terms(cls, query: str, top_k: int = 3) -> str:
        """
        Busca trechos de TRs pré-aprovados da FSPH como referência.
        """
        return cls._search("termos_aprovados", query, top_k, "TRs Aprovados FSPH")

    @classmethod
    def get_full_context(cls, query: str) -> str:
        """
        Retorna contexto completo: trechos da lei + TRs de referência.
        Usado no system prompt do chat IA.
        """
        if not cls._indexed:
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
        """Executa busca semântica e formata os resultados."""
        if cls._client is None or cls._embedder is None:
            return ""
        try:
            collection = cls._client.get_collection(collection_name)
            if collection.count() == 0:
                return ""

            # Gera embedding da query
            query_embedding = cls._embedder.encode(query).tolist()

            # Busca por similaridade coseno
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=min(top_k, collection.count()),
                include=["documents", "metadatas"],
            )

            if not results["documents"] or not results["documents"][0]:
                return ""

            # Formata os resultados
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
        """
        Divide o texto em chunks com overlap.
        Retorna lista de {'text': ..., 'source': ..., 'chunk_index': ...}
        """
        # Remove espaços excessivos
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)

        chunks = []
        start = 0
        chunk_idx = 0

        while start < len(text):
            end = start + CHUNK_SIZE

            # Tenta quebrar em fim de parágrafo
            if end < len(text):
                break_pos = text.rfind("\n\n", start, end)
                if break_pos == -1:
                    break_pos = text.rfind(". ", start, end)
                if break_pos != -1 and break_pos > start:
                    end = break_pos + 1

            chunk_text = text[start:end].strip()
            if len(chunk_text) > 50:  # ignora chunks muito pequenos
                chunks.append({
                    "text": chunk_text,
                    "source": source,
                    "chunk_index": chunk_idx,
                })
            chunk_idx += 1
            start = end - CHUNK_OVERLAP  # overlap

        return chunks

    @classmethod
    def _add_to_collection(
        cls,
        collection: chromadb.Collection,
        chunks: list[dict],
    ) -> None:
        """Gera embeddings e adiciona chunks ao ChromaDB em lotes."""
        if not chunks:
            return

        BATCH_SIZE = 100  # ChromaDB recomenda lotes de até 100

        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i:i + BATCH_SIZE]
            texts = [c["text"] for c in batch]
            ids = [f"{c['source']}_{c['chunk_index']}" for c in batch]
            metadatas = [{"source": c["source"], "chunk_index": c["chunk_index"]}
                         for c in batch]

            # Gera embeddings em lote (muito mais rápido que um por um)
            embeddings = cls._embedder.encode(texts, batch_size=32).tolist()

            collection.add(
                ids=ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
            )
            logger.debug("Lote indexado: %d/%d chunks", i + len(batch), len(chunks))
