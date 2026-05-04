"""workflow and checklist tables

Revision ID: 003
Revises: 002
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import func

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Create workflow_action enum (new)
    # ------------------------------------------------------------------ #
    workflow_action = postgresql.ENUM(
        "criar", "avancar", "devolver",
        name="workflow_action", create_type=False,
    )
    workflow_action.create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------ #
    # 2. Migrate term_status: 4 old values → 8 new workflow states
    # ------------------------------------------------------------------ #

    # 2a. Drop server default before altering column type
    op.execute("ALTER TABLE terms ALTER COLUMN status DROP DEFAULT")

    # 2b. Rename existing enum so we can create a new one with the same name
    op.execute("ALTER TYPE term_status RENAME TO term_status_old")

    # 2c. Create new term_status enum with 8 workflow states
    op.execute(
        "CREATE TYPE term_status AS ENUM ("
        "'Rascunho', "
        "'Aguardando DIROP', "
        "'Aguardando DIRAF', "
        "'Aguardando DIGER', "
        "'Instrução COLIC', "
        "'Aguardando Jurídico', "
        "'Aprovação DIRAF/DIGER', "
        "'Homologado'"
        ")"
    )

    # 2d. Migrate existing rows: map old values to new states
    op.execute(
        "ALTER TABLE terms ALTER COLUMN status TYPE term_status USING ("
        "CASE status::text "
        "WHEN 'rascunho'   THEN 'Rascunho' "
        "WHEN 'em_analise' THEN 'Aguardando DIROP' "
        "WHEN 'validado'   THEN 'Aguardando DIROP' "
        "WHEN 'reprovado'  THEN 'Rascunho' "
        "END"
        ")::term_status"
    )

    # 2e. Restore default with new enum value
    op.execute("ALTER TABLE terms ALTER COLUMN status SET DEFAULT 'Rascunho'")

    # 2f. Drop old enum
    op.execute("DROP TYPE term_status_old")

    # ------------------------------------------------------------------ #
    # 3. Add setor_atual column to terms (enum user_setor, already exists)
    # ------------------------------------------------------------------ #
    user_setor = postgresql.ENUM(
        "demandante", "dirop", "diraf", "diger", "colic", "juridico",
        name="user_setor", create_type=False,
    )

    op.add_column(
        "terms",
        sa.Column(
            "setor_atual",
            user_setor,
            nullable=False,
            server_default="demandante",
        ),
    )

    # ------------------------------------------------------------------ #
    # 4. Add created_by_id FK column to terms
    # ------------------------------------------------------------------ #
    op.add_column(
        "terms",
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_terms_created_by_id_users",
        "terms",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ------------------------------------------------------------------ #
    # 5. Create term_checklists table
    # ------------------------------------------------------------------ #
    op.create_table(
        "term_checklists",
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
            unique=True,
            nullable=False,
        ),
        sa.Column("dfd",       sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("etp",       sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("tr",        sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("dotacao",   sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auth_dirop", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auth_diraf", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auth_diger", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "updated_at",
            sa.String(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ------------------------------------------------------------------ #
    # 6. Create workflow_events table
    # ------------------------------------------------------------------ #
    op.create_table(
        "workflow_events",
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
        ),
        sa.Column(
            "ator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "de_setor",
            postgresql.ENUM(
                "demandante", "dirop", "diraf", "diger", "colic", "juridico",
                name="user_setor", create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "para_setor",
            postgresql.ENUM(
                "demandante", "dirop", "diraf", "diger", "colic", "juridico",
                name="user_setor", create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "acao",
            postgresql.ENUM(
                "criar", "avancar", "devolver",
                name="workflow_action", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("observacao",  sa.TEXT(), nullable=True),
        sa.Column(
            "created_at",
            sa.String(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_workflow_events_term", "workflow_events", ["term_id"])

    # ------------------------------------------------------------------ #
    # 7. Backfill: create checklist rows for existing terms
    # ------------------------------------------------------------------ #
    op.execute("INSERT INTO term_checklists (term_id) SELECT id FROM terms")

    # ------------------------------------------------------------------ #
    # 8. Backfill: create initial workflow_events for existing terms
    # ------------------------------------------------------------------ #
    op.execute(
        "INSERT INTO workflow_events (term_id, acao, para_setor, observacao) "
        "SELECT id, 'criar', 'demandante', 'Backfill 003' FROM terms"
    )


def downgrade() -> None:
    # Reverse in opposite order

    # 8 & 7: Drop backfill rows (cascade handles this via table drops below)

    # 6. Drop workflow_events
    op.drop_index("ix_workflow_events_term", table_name="workflow_events")
    op.drop_table("workflow_events")

    # 5. Drop term_checklists
    op.drop_table("term_checklists")

    # 4. Drop created_by_id from terms
    op.drop_constraint("fk_terms_created_by_id_users", "terms", type_="foreignkey")
    op.drop_column("terms", "created_by_id")

    # 3. Drop setor_atual from terms
    op.drop_column("terms", "setor_atual")

    # 2. Migrate term_status back: 8 states → 4 old values
    op.execute("ALTER TABLE terms ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE term_status RENAME TO term_status_new")
    op.execute(
        "CREATE TYPE term_status AS ENUM ("
        "'rascunho', 'em_analise', 'validado', 'reprovado'"
        ")"
    )
    op.execute(
        "ALTER TABLE terms ALTER COLUMN status TYPE term_status USING ("
        "CASE status::text "
        "WHEN 'Rascunho'              THEN 'rascunho' "
        "WHEN 'Aguardando DIROP'      THEN 'em_analise' "
        "WHEN 'Aguardando DIRAF'      THEN 'em_analise' "
        "WHEN 'Aguardando DIGER'      THEN 'em_analise' "
        "WHEN 'Instrução COLIC'       THEN 'em_analise' "
        "WHEN 'Aguardando Jurídico'   THEN 'em_analise' "
        "WHEN 'Aprovação DIRAF/DIGER' THEN 'em_analise' "
        "WHEN 'Homologado'            THEN 'validado' "
        "END"
        ")::term_status"
    )
    op.execute("ALTER TABLE terms ALTER COLUMN status SET DEFAULT 'rascunho'")
    op.execute("DROP TYPE term_status_new")

    # 1. Drop workflow_action enum
    postgresql.ENUM(name="workflow_action").drop(op.get_bind(), checkfirst=True)
