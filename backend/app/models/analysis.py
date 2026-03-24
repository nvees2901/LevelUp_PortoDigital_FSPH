"""
analysis.py — Model SQLAlchemy para a tabela `analyses`

Representa o resultado de uma análise de conformidade de um TR
contra os 10 critérios da Lei 14.133/2021.

Cada TR pode ter MÚLTIPLAS análises ao longo do tempo (histórico),
permitindo acompanhar a evolução da conformidade após correções.

Relação com Term:
  Term 1 ─── N Analysis
  (um TR pode ser analisado várias vezes)
"""

import uuid
from decimal import Decimal

from sqlalchemy import DECIMAL, VARCHAR, Enum, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Analysis(Base):
    """
    Tabela `analyses` — resultados de conformidade com a Lei 14.133/2021.

    Estrutura do JSONB `criteria_results`:
    {
      "objeto_descricao": {
        "status": "aprovado|alerta|reprovado",
        "score": 0-10,
        "artigo": "Art. 6º, XXIII, a",
        "descricao": "Descrição clara do objeto da contratação",
        "sugestao": "Inclua especificações técnicas detalhadas..."
      },
      "justificativa": { ... },
      ... (10 critérios no total)
    }
    """

    __tablename__ = "analyses"

    # --- Identificação ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    # --- Chave estrangeira ---
    # ondelete="CASCADE": ao deletar o TR, todas as análises são deletadas automaticamente
    # Isso evita "análises órfãs" sem TR associado
    term_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("terms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,   # índice para acelerar queries de histórico por termo
        comment="ID do Termo de Referência analisado",
    )

    # --- Score de conformidade ---
    compliance_score: Mapped[Decimal] = mapped_column(
        DECIMAL(5, 2),
        nullable=False,
        comment="Score de 0.00 a 100.00 baseado nos 10 critérios ponderados",
    )

    # --- Status calculado a partir do score ---
    # < 50   → reprovado
    # 50-79  → alerta
    # >= 80  → aprovado
    status: Mapped[str] = mapped_column(
        Enum("aprovado", "alerta", "reprovado", name="analysis_status"),
        nullable=False,
        comment="Status calculado: aprovado (>=80), alerta (50-79), reprovado (<50)",
    )

    # --- Resultados detalhados (JSONB) ---
    criteria_results: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        comment="Resultado individual de cada um dos 10 critérios da Lei 14.133",
    )

    suggestions: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Lista priorizada de sugestões de melhoria geradas pela análise",
    )

    legal_references: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Artigos da Lei 14.133 referenciados na análise",
    )

    # --- Timestamps ---
    created_at: Mapped[str] = mapped_column(
        VARCHAR(50),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[str] = mapped_column(
        VARCHAR(50),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # --- Relacionamento com Term ---
    term: Mapped["Term"] = relationship(  # type: ignore[name-defined]
        "Term",
        back_populates="analyses",
    )

    # ------------------------------------------------------------------ #
    # Métodos auxiliares
    # ------------------------------------------------------------------ #

    @classmethod
    def calculate_status(cls, score: float) -> str:
        """
        Determina o status com base no score de conformidade.

        Regra de negócio (CONTEXT.md #9):
          >= 80 → aprovado   (conforme com a Lei 14.133)
          50-79 → alerta     (conformidade parcial, requer atenção)
          < 50  → reprovado  (não conforme, bloqueante)
        """
        if score >= 80:
            return "aprovado"
        elif score >= 50:
            return "alerta"
        return "reprovado"

    def __repr__(self) -> str:
        return (
            f"<Analysis id={self.id} term_id={self.term_id} "
            f"score={self.compliance_score} status={self.status}>"
        )
