"""
term.py — Model SQLAlchemy para a tabela `terms`

Representa um Termo de Referência (TR) no banco de dados.

Decisões de design:
  - UUID como PK: sem colisão entre ambientes, não enumerável por atacantes
  - JSONB para sections/variable_fields: estrutura flexível sem migrações
    cada vez que o NLP detectar um novo tipo de campo
  - Enums para category/status: garante integridade de dados no próprio banco
  - CASCADE delete: ao deletar um TR, suas análises também são removidas
"""

import unicodedata
import uuid
from decimal import Decimal

from sqlalchemy import DECIMAL, TEXT, VARCHAR, Enum, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ------------------------------------------------------------------ #
# Enums — valores controlados armazenados no banco
# ------------------------------------------------------------------ #

class TermCategory(str):
    """Categorias válidas para um Termo de Referência."""
    CAPACITACAO = "capacitacao"
    AQUISICAO = "aquisicao"
    SERVICO_TECNICO = "servico_tecnico"
    OUTRO = "outro"


class TermStatus(str):
    """Ciclo de vida de um Termo de Referência (fluxo de tramitação)."""
    RASCUNHO = "Rascunho"
    AGUARDANDO_DIROP = "Aguardando DIROP"
    AGUARDANDO_DIRAF = "Aguardando DIRAF"
    AGUARDANDO_DIGER = "Aguardando DIGER"
    INSTRUCAO_COLIC = "Instrução COLIC"
    AGUARDANDO_JURIDICO = "Aguardando Jurídico"
    APROVACAO_DIRAF_DIGER = "Aprovação DIRAF/DIGER"
    HOMOLOGADO = "Homologado"


# ------------------------------------------------------------------ #
# Model
# ------------------------------------------------------------------ #

class Term(Base):
    """
    Tabela `terms` — armazena os Termos de Referência da FSPH.

    Relações:
      - analyses: list[Analysis] — histórico de análises deste TR
      - chat_sessions: list[ChatSession] — sessões de chat que geraram este TR
    """

    __tablename__ = "terms"

    # --- Identificação ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
        comment="Identificador único universal do termo",
    )

    # --- Conteúdo principal ---
    title: Mapped[str] = mapped_column(
        VARCHAR(500),
        nullable=False,
        comment="Título/objeto do Termo de Referência",
    )

    category: Mapped[str] = mapped_column(
        Enum(
            "capacitacao", "aquisicao", "servico_tecnico", "outro",
            name="term_category",
        ),
        nullable=False,
        default="outro",
        comment="Categoria do TR detectada por NLP ou informada manualmente",
    )

    status: Mapped[str] = mapped_column(
        Enum(
            "Rascunho",
            "Aguardando DIROP",
            "Aguardando DIRAF",
            "Aguardando DIGER",
            "Instrução COLIC",
            "Aguardando Jurídico",
            "Aprovação DIRAF/DIGER",
            "Homologado",
            name="term_status",
        ),
        nullable=False,
        default="Rascunho",
        comment="Status atual do TR no fluxo de tramitação",
    )

    setor_atual: Mapped[str] = mapped_column(
        Enum(
            "demandante", "dirop", "diraf", "diger", "colic", "juridico",
            name="user_setor",
            create_constraint=False,
        ),
        nullable=False,
        default="demandante",
        comment="Setor responsável pelo TR no momento atual",
    )

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuário que criou o TR",
    )

    content: Mapped[str | None] = mapped_column(
        TEXT,
        nullable=True,
        comment="Conteúdo textual completo extraído do documento",
    )

    # --- Estrutura detectada por NLP ---
    sections: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=dict,
        comment="Seções identificadas pelo NLP ex: {objeto, justificativa, valor...}",
    )

    variable_fields: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
        default=list,
        comment="Campos variáveis detectados ex: ['{{EMPRESA}}', '{{VALOR}}']",
    )

    estimated_value: Mapped[Decimal | None] = mapped_column(
        DECIMAL(15, 2),
        nullable=True,
        comment="Valor estimado da contratação extraído automaticamente do texto",
    )

    # --- Arquivo original ---
    original_filename: Mapped[str | None] = mapped_column(
        VARCHAR(255),
        nullable=True,
        comment="Nome original do arquivo enviado pelo usuário",
    )

    file_path: Mapped[str | None] = mapped_column(
        VARCHAR(500),
        nullable=True,
        comment="Caminho interno do arquivo armazenado no servidor",
    )

    # --- Timestamps ---
    # server_default: o banco define o valor, não o Python
    # onupdate: atualizado automaticamente a cada UPDATE
    created_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # --- Relacionamentos ---
    # back_populates: vincula o lado "um" ao lado "muitos"
    # lazy="select": carrega análises apenas quando acessadas (não junto com o TR)
    analyses: Mapped[list["Analysis"]] = relationship(  # type: ignore[name-defined]
        "Analysis",
        back_populates="term",
        cascade="all, delete-orphan",  # deletar TR deleta suas análises automaticamente
        lazy="select",
    )

    chat_sessions: Mapped[list["ChatSession"]] = relationship(  # type: ignore[name-defined]
        "ChatSession",
        back_populates="generated_term",
        lazy="select",
    )

    # --- Workflow ---
    checklist: Mapped["TermChecklist | None"] = relationship(  # type: ignore[name-defined]
        "TermChecklist",
        back_populates="term",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="select",
    )

    events: Mapped[list["WorkflowEvent"]] = relationship(  # type: ignore[name-defined]
        "WorkflowEvent",
        back_populates="term",
        cascade="all, delete-orphan",
        lazy="select",
    )

    created_by: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        lazy="select",
        foreign_keys=[created_by_id],
    )

    # ------------------------------------------------------------------ #
    # Métodos auxiliares
    # ------------------------------------------------------------------ #

    @property
    def title_normalized(self) -> str:
        """
        Título sem acentos e em minúsculas para busca textual.

        Por que aqui e não no banco?
          Evita dependência da extensão `unaccent` do PostgreSQL.
          A normalização acontece em Python, que é portável.

        Exemplo:
          "Aquisição de Serviços Técnicos" → "aquisicao de servicos tecnicos"
        """
        nfkd = unicodedata.normalize("NFKD", self.title)
        return "".join(c for c in nfkd if not unicodedata.combining(c)).casefold()

    def __repr__(self) -> str:
        return f"<Term id={self.id} title={self.title!r} status={self.status}>"
