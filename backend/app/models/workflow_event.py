"""
workflow_event.py — Model SQLAlchemy para a tabela `workflow_events`

Registra cada transição de estado de um Termo de Referência no fluxo
de tramitação (workflow). Imutável: apenas inserções, nunca atualizações.

Ações possíveis (enum workflow_action):
  criar    — criação inicial do TR
  avancar  — avança para o próximo setor
  devolver — devolve ao setor anterior (com observação obrigatória)
"""

import uuid

from sqlalchemy import Enum, ForeignKey, String, TEXT
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class WorkflowEvent(Base):
    """
    Tabela `workflow_events` — histórico de tramitação de cada TR.

    Cada linha é imutável e representa um momento no fluxo:
      - Quem (ator_id) fez
      - O quê (acao: criar | avancar | devolver)
      - De onde para onde (de_setor → para_setor)
      - Com qual justificativa (observacao)
    """

    __tablename__ = "workflow_events"

    # --- Identificação ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        comment="Identificador único do evento",
    )

    # --- FK para o TR ---
    term_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("terms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="TR ao qual este evento pertence",
    )

    # --- FK para o usuário que executou a ação (nullable: sistema pode criar) ---
    ator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuário que executou a ação (null se originado pelo sistema)",
    )

    # --- Setores de origem e destino ---
    de_setor: Mapped[str | None] = mapped_column(
        Enum(
            "demandante", "dirop", "diraf", "diger", "colic", "juridico",
            name="user_setor",
            create_constraint=False,
        ),
        nullable=True,
        comment="Setor de onde o TR partiu (null na criação)",
    )

    para_setor: Mapped[str | None] = mapped_column(
        Enum(
            "demandante", "dirop", "diraf", "diger", "colic", "juridico",
            name="user_setor",
            create_constraint=False,
        ),
        nullable=True,
        comment="Setor para onde o TR foi",
    )

    # --- Ação executada ---
    acao: Mapped[str] = mapped_column(
        Enum(
            "criar", "avancar", "devolver",
            name="workflow_action",
            create_constraint=False,
        ),
        nullable=False,
        comment="Tipo de ação: criar | avancar | devolver",
    )

    # --- Justificativa (obrigatória em devoluções) ---
    observacao: Mapped[str | None] = mapped_column(
        TEXT,
        nullable=True,
        comment="Justificativa da ação (obrigatória em devoluções)",
    )

    # --- Timestamp de criação (imutável) ---
    created_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        nullable=False,
    )

    # --- Relacionamentos ---
    term: Mapped["Term"] = relationship(  # type: ignore[name-defined]
        "Term",
        back_populates="events",
    )

    ator: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        lazy="select",
        foreign_keys=[ator_id],
    )

    def __repr__(self) -> str:
        return (
            f"<WorkflowEvent term_id={self.term_id} "
            f"acao={self.acao!r} "
            f"de={self.de_setor!r} → para={self.para_setor!r}>"
        )
