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

from pydantic import BaseModel


class ContextDocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_by_id: str
    uploaded_at: str
    indexed_at: str | None
    status: str
    chunks_count: int | None
    error_message: str | None

    model_config = {"from_attributes": True}


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
