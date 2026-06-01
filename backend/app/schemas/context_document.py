"""
context_document.py (schema) — Schemas Pydantic para documentos de contexto da IA.

Usados nas respostas dos endpoints de administração:
  POST   /api/v1/admin/context-documents
  GET    /api/v1/admin/context-documents
  DELETE /api/v1/admin/context-documents/{id}
  POST   /api/v1/admin/context-documents/{id}/reindex
  GET    /api/v1/admin/context-documents/{id}/download
  GET    /api/v1/admin/knowledge-base/collections
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class ContextDocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_by_id: str | None
    uploaded_at: str
    indexed_at: str | None
    status: str
    chunks_count: int | None
    error_message: str | None
    is_active: bool
    collection: str
    is_seed: bool

    model_config = {"from_attributes": True}

    @field_validator("uploaded_at", "indexed_at", mode="before")
    @classmethod
    def datetime_to_isoformat(cls, v: Any) -> str | None:
        """Converte datetime do SQLAlchemy para string ISO-8601."""
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, str):
            return v
        return str(v)


class ContextDocumentList(BaseModel):
    items: list[ContextDocumentResponse]
    total: int


class KnowledgeBaseCollection(BaseModel):
    name: str
    display_name: str
    description: str
    chunks_count: int | None
    is_readonly: bool


class KnowledgeBaseCollectionList(BaseModel):
    items: list[KnowledgeBaseCollection]
    total: int
