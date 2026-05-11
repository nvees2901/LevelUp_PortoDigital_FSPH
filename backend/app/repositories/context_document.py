"""
context_document.py (repository) — Camada de acesso ao banco para documentos de contexto da IA.

Padrão: métodos estáticos recebem a sessão como primeiro argumento,
mantendo consistência com os demais repositórios do projeto.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.context_document import ContextDocument


class ContextDocumentRepository:

    # ------------------------------------------------------------------ #
    # Criação
    # ------------------------------------------------------------------ #

    @staticmethod
    async def create(db: AsyncSession, data: dict) -> ContextDocument:
        """Persiste um novo documento de contexto e retorna o objeto criado."""
        doc = ContextDocument(**data)
        db.add(doc)
        await db.flush()
        await db.refresh(doc)
        return doc

    # ------------------------------------------------------------------ #
    # Leitura
    # ------------------------------------------------------------------ #

    @staticmethod
    async def list_all(db: AsyncSession) -> list[ContextDocument]:
        """Retorna todos os documentos, ordenados do mais recente para o mais antigo."""
        result = await db.execute(
            select(ContextDocument).order_by(ContextDocument.uploaded_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, doc_id: str) -> ContextDocument | None:
        """Busca um documento pelo UUID. Retorna None se não existir."""
        result = await db.execute(
            select(ContextDocument).where(ContextDocument.id == doc_id)
        )
        return result.scalar_one_or_none()

    # ------------------------------------------------------------------ #
    # Exclusão
    # ------------------------------------------------------------------ #

    @staticmethod
    async def delete(db: AsyncSession, doc: ContextDocument) -> None:
        """Remove um documento de contexto do banco."""
        await db.delete(doc)
        await db.flush()

    # ------------------------------------------------------------------ #
    # Atualização de status de indexação
    # ------------------------------------------------------------------ #

    @staticmethod
    async def mark_indexed(db: AsyncSession, doc: ContextDocument, chunks_count: int) -> None:
        """Marca o documento como indexado com sucesso."""
        doc.status = "indexed"
        doc.chunks_count = chunks_count
        doc.indexed_at = datetime.now(timezone.utc).isoformat()
        await db.flush()

    @staticmethod
    async def mark_failed(db: AsyncSession, doc: ContextDocument, error: str) -> None:
        """Marca o documento como com falha de indexação."""
        doc.status = "failed"
        doc.error_message = error
        await db.flush()
