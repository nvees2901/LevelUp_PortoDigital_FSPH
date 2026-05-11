"""create users table

Revision ID: 002
Revises: 001
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_setor = postgresql.ENUM(
        "demandante", "dirop", "diraf", "diger", "colic", "juridico",
        name="user_setor", create_type=False,
    )
    user_setor.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("matricula", sa.VARCHAR(50), nullable=False),
        sa.Column("senha_hash", sa.VARCHAR(255), nullable=False),
        sa.Column("nome", sa.VARCHAR(200), nullable=False),
        sa.Column("setor_id", user_setor, nullable=False),
        sa.Column("subunidade", sa.VARCHAR(120), nullable=True),
        sa.Column(
            "ativo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.String(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.String(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_matricula", "users", ["matricula"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_matricula", table_name="users")
    op.drop_table("users")
    postgresql.ENUM(name="user_setor").drop(op.get_bind(), checkfirst=True)
