"""
context_document.py (schema) — Schemas Pydantic para documentos de contexto da IA.

Usados nas respostas dos endpoints de administração:
  POST   /api/v1/admin/context-documents
  GET    /api/v1/admin/context-documents
  DELETE /api/v1/admin/context-documents/{id}
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
