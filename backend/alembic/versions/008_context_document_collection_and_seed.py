"""add collection and is_seed columns to context_documents, make uploaded_by_id nullable

Revision ID: 008
Revises: 007
Create Date: 2026-05-25

Habilita gerenciamento das bases de conhecimento fixas (lei_14133, termos_aprovados)
com a mesma paridade de context_extra: uploads, exclusão, desativar/reativar.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "context_documents",
        sa.Column(
            "collection",
            sa.VARCHAR(40),
            nullable=False,
            server_default=sa.text("'context_extra'"),
        ),
    )
    op.add_column(
        "context_documents",
        sa.Column("is_seed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("context_documents", "uploaded_by_id", nullable=True)


def downgrade() -> None:
    op.alter_column("context_documents", "uploaded_by_id", nullable=False)
    op.drop_column("context_documents", "is_seed")
    op.drop_column("context_documents", "collection")
