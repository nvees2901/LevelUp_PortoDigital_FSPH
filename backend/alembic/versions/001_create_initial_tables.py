"""create initial tables

Revision ID: 001
Revises:
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enums ---
    term_category = postgresql.ENUM(
        "capacitacao", "aquisicao", "servico_tecnico", "outro",
        name="term_category", create_type=False,
    )
    term_status = postgresql.ENUM(
        "rascunho", "em_analise", "validado", "reprovado",
        name="term_status", create_type=False,
    )
    analysis_status = postgresql.ENUM(
        "aprovado", "alerta", "reprovado",
        name="analysis_status", create_type=False,
    )
    chat_mode = postgresql.ENUM(
        "gerar", "analisar", "consultar",
        name="chat_mode", create_type=False,
    )

    # Cria os tipos ENUM no banco
    term_category.create(op.get_bind(), checkfirst=True)
    term_status.create(op.get_bind(), checkfirst=True)
    analysis_status.create(op.get_bind(), checkfirst=True)
    chat_mode.create(op.get_bind(), checkfirst=True)

    # --- Tabela terms ---
    op.create_table(
        "terms",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
            comment="Identificador único universal do termo",
        ),
        sa.Column(
            "title",
            sa.VARCHAR(500),
            nullable=False,
            comment="Título/objeto do Termo de Referência",
        ),
        sa.Column(
            "category",
            term_category,
            nullable=False,
            server_default="outro",
            comment="Categoria do TR detectada por NLP ou informada manualmente",
        ),
        sa.Column(
            "status",
            term_status,
            nullable=False,
            server_default="rascunho",
            comment="Status atual do TR no fluxo de validação",
        ),
        sa.Column(
            "content",
            sa.TEXT(),
            nullable=True,
            comment="Conteúdo textual completo extraído do documento",
        ),
        sa.Column(
            "sections",
            postgresql.JSONB(),
            nullable=True,
            comment="Seções identificadas pelo NLP",
        ),
        sa.Column(
            "variable_fields",
            postgresql.JSONB(),
            nullable=True,
            comment="Campos variáveis detectados",
        ),
        sa.Column(
            "estimated_value",
            sa.DECIMAL(15, 2),
            nullable=True,
            comment="Valor estimado da contratação",
        ),
        sa.Column(
            "original_filename",
            sa.VARCHAR(255),
            nullable=True,
            comment="Nome original do arquivo enviado pelo usuário",
        ),
        sa.Column(
            "file_path",
            sa.VARCHAR(500),
            nullable=True,
            comment="Caminho interno do arquivo armazenado no servidor",
        ),
        sa.Column(
            "created_at",
            sa.String(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.String(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- Tabela analyses ---
    op.create_table(
        "analyses",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "term_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("terms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
            comment="ID do Termo de Referência analisado",
        ),
        sa.Column(
            "compliance_score",
            sa.DECIMAL(5, 2),
            nullable=False,
            comment="Score de 0.00 a 100.00",
        ),
        sa.Column(
            "status",
            analysis_status,
            nullable=False,
            comment="Status: aprovado (>=80), alerta (50-79), reprovado (<50)",
        ),
        sa.Column(
            "criteria_results",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
            comment="Resultado individual de cada critério da Lei 14.133",
        ),
        sa.Column(
            "suggestions",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
            comment="Lista de sugestões de melhoria",
        ),
        sa.Column(
            "legal_references",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
            comment="Artigos da Lei 14.133 referenciados",
        ),
        sa.Column(
            "created_at",
            sa.VARCHAR(50),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.VARCHAR(50),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- Tabela chat_sessions ---
    op.create_table(
        "chat_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "mode",
            chat_mode,
            nullable=False,
            comment="Modo de operação do chat: gerar, analisar ou consultar",
        ),
        sa.Column(
            "messages",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
            comment="Histórico [{role: user|assistant|system, content: str}]",
        ),
        sa.Column(
            "generated_term_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("terms.id", ondelete="SET NULL"),
            nullable=True,
            comment="ID do TR gerado por esta sessão (apenas modo 'gerar')",
        ),
        sa.Column(
            "created_at",
            sa.VARCHAR(50),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.VARCHAR(50),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("chat_sessions")
    op.drop_table("analyses")
    op.drop_table("terms")

    # Remove os tipos ENUM
    for name in ("chat_mode", "analysis_status", "term_status", "term_category"):
        postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
