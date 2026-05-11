"""chat sessions user ownership and term_id context

Revision ID: 005
Revises: 004
Create Date: 2026-05-11

DESTRUCTIVE: truncates chat_sessions before adding NOT NULL user_id column.
No production data exists — approved by project owner.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Truncate before adding NOT NULL column (no existing prod data)
    op.execute("TRUNCATE TABLE chat_sessions")

    # Add user_id — NOT NULL, FK → users.id CASCADE DELETE
    op.add_column(
        "chat_sessions",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    # Add title — optional, derived from first user message
    op.add_column(
        "chat_sessions",
        sa.Column("title", sa.VARCHAR(120), nullable=True),
    )

    # Add term_id — optional, FK → terms.id SET NULL
    op.add_column(
        "chat_sessions",
        sa.Column(
            "term_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("terms.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Composite index for listing sessions by user, sorted by updated_at
    op.create_index(
        "ix_chat_sessions_user_id_updated_at",
        "chat_sessions",
        ["user_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_sessions_user_id_updated_at", table_name="chat_sessions")
    op.drop_column("chat_sessions", "term_id")
    op.drop_column("chat_sessions", "title")
    op.drop_column("chat_sessions", "user_id")
