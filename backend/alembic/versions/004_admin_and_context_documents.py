"""admin role and context documents table

Revision ID: 004
Revises: 003
Create Date: 2026-05-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Add is_admin to users
    # ------------------------------------------------------------------ #
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ------------------------------------------------------------------ #
    # 2. Create context_documents table
    # ------------------------------------------------------------------ #
    op.create_table(
        "context_documents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("filename",          sa.VARCHAR(255),  nullable=False),
        sa.Column("original_filename", sa.VARCHAR(255),  nullable=False),
        sa.Column("mime_type",         sa.VARCHAR(80),   nullable=False),
        sa.Column("size_bytes",        sa.Integer(),     nullable=False),
        sa.Column("storage_path",      sa.VARCHAR(500),  nullable=False),
        sa.Column(
            "uploaded_by_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("indexed_at",     sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.VARCHAR(20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("chunks_count",   sa.Integer(), nullable=True),
        sa.Column("error_message",  sa.Text(),    nullable=True),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"], ["users.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_context_documents_status",         "context_documents", ["status"])
    op.create_index("ix_context_documents_uploaded_by_id", "context_documents", ["uploaded_by_id"])


def downgrade() -> None:
    op.drop_index("ix_context_documents_uploaded_by_id", table_name="context_documents")
    op.drop_index("ix_context_documents_status",         table_name="context_documents")
    op.drop_table("context_documents")
    op.drop_column("users", "is_admin")
