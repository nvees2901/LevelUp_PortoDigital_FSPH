"""
term_checklist.py — Model SQLAlchemy para a tabela `term_checklists`

Representa o checklist de documentos obrigatórios de um Termo de Referência.
Relação 1-para-1 com Term (cada TR tem exatamente um checklist).

Campos booleanos:
  dfd        — Documento de Formalização de Demanda
  etp        — Estudo Técnico Preliminar
  tr         — Termo de Referência (o próprio documento)
  dotacao    — Dotação orçamentária
  auth_dirop — Autorização da DIROP
  auth_diraf — Autorização da DIRAF
  auth_diger — Autorização da DIGER
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class TermChecklist(Base):
    """
    Tabela `term_checklists` — checklist de documentos de cada TR.

    Criada automaticamente quando um TR é criado (via backfill na migration
    ou no serviço de criação de TRs).
    """

    __tablename__ = "term_checklists"

    # --- Identificação ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        comment="Identificador único do checklist",
    )

    # --- FK para o TR (1-para-1, UNIQUE) ---
    term_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("terms.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        comment="ID do Termo de Referência associado",
    )

    # --- Campos do checklist (todos iniciam como False) ---
    dfd: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Documento de Formalização de Demanda",
    )
    etp: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Estudo Técnico Preliminar",
    )
    tr: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Termo de Referência (documento principal)",
    )
    dotacao: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Dotação orçamentária",
    )
    auth_dirop: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Autorização da DIROP",
    )
    auth_diraf: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Autorização da DIRAF",
    )
    auth_diger: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Autorização da DIGER",
    )

    # --- Timestamp (String, igual ao padrão dos outros models) ---
    updated_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # --- Relacionamento ---
    term: Mapped["Term"] = relationship(  # type: ignore[name-defined]
        "Term",
        back_populates="checklist",
    )

    def __repr__(self) -> str:
        return (
            f"<TermChecklist term_id={self.term_id} "
            f"dfd={self.dfd} etp={self.etp} tr={self.tr} "
            f"dotacao={self.dotacao} auth_dirop={self.auth_dirop} "
            f"auth_diraf={self.auth_diraf} auth_diger={self.auth_diger}>"
        )
