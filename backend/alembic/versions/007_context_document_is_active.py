"""add is_active column to context_documents

Revision ID: 007
Revises: 006
Create Date: 2026-05-25

Permite ao administrador desativar um TR já indexado sem removê-lo do banco.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "context_documents",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("context_documents", "is_active")
