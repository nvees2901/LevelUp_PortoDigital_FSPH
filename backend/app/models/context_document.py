"""
context_document.py — Model SQLAlchemy para a tabela `context_documents`

Representa um documento de contexto carregado por um administrador para
enriquecer as respostas da IA com conhecimento institucional da FSPH.

Ciclo de vida do status:
  pending → indexed  (indexação bem-sucedida)
  pending → failed   (falha na indexação)
"""

import uuid

from sqlalchemy import Integer, String, Text, VARCHAR, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class ContextDocument(Base):
    """
    Tabela `context_documents` — armazena metadados de documentos de contexto da IA.

    O arquivo físico fica em CONTEXT_DOCS_DIR (configurável via settings).
    O campo `storage_path` aponta para o caminho relativo dentro desse diretório.
    """

    __tablename__ = "context_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
        comment="Identificador único do documento de contexto",
    )
    filename: Mapped[str] = mapped_column(
        VARCHAR(255),
        nullable=False,
        comment="Nome do arquivo no servidor (UUID-based, sem conflito)",
    )
    original_filename: Mapped[str] = mapped_column(
        VARCHAR(255),
        nullable=False,
        comment="Nome original do arquivo enviado pelo administrador",
    )
    mime_type: Mapped[str] = mapped_column(
        VARCHAR(80),
        nullable=False,
        comment="Tipo MIME do arquivo (ex: application/pdf, text/plain)",
    )
    size_bytes: Mapped[int] = mapped_column(
        Integer(),
        nullable=False,
        comment="Tamanho do arquivo em bytes",
    )
    storage_path: Mapped[str] = mapped_column(
        VARCHAR(500),
        nullable=False,
        comment="Caminho relativo ao CONTEXT_DOCS_DIR onde o arquivo está armazenado",
    )
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        comment="UUID do administrador que fez o upload",
    )
    uploaded_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        nullable=False,
        comment="Timestamp do upload (ISO 8601)",
    )
    indexed_at: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
        comment="Timestamp da indexação bem-sucedida no banco vetorial",
    )
    status: Mapped[str] = mapped_column(
        VARCHAR(20),
        nullable=False,
        default="pending",
        server_default=text("'pending'"),
        comment="Estado de indexação: pending | indexed | failed",
    )
    chunks_count: Mapped[int | None] = mapped_column(
        Integer(),
        nullable=True,
        comment="Número de chunks gerados na indexação",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text(),
        nullable=True,
        comment="Mensagem de erro se status=failed",
    )

    def __repr__(self) -> str:
        return f"<ContextDocument id={self.id} filename={self.original_filename!r} status={self.status}>"
