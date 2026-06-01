"""fix timestamp columns from VARCHAR/String to TIMESTAMP WITH TIME ZONE

Revision ID: 006
Revises: 005
Create Date: 2026-05-25

Converts all created_at / updated_at / uploaded_at / indexed_at columns
that were mistakenly stored as VARCHAR or String to TIMESTAMPTZ (DateTime
with timezone=True). Uses PostgreSQL USING clause for safe in-place cast.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # terms — created_at (String), updated_at (String)
    # ------------------------------------------------------------------ #
    op.alter_column(
        "terms",
        "created_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::timestamptz",
    )
    op.alter_column(
        "terms",
        "updated_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::timestamptz",
    )

    # ------------------------------------------------------------------ #
    # users — created_at (String), updated_at (String)
    # ------------------------------------------------------------------ #
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::timestamptz",
    )
    op.alter_column(
        "users",
        "updated_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::timestamptz",
    )

    # ------------------------------------------------------------------ #
    # analyses — created_at (VARCHAR(50)), updated_at (VARCHAR(50))
    # ------------------------------------------------------------------ #
    op.alter_column(
        "analyses",
        "created_at",
        existing_type=sa.VARCHAR(50),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::timestamptz",
    )
    op.alter_column(
        "analyses",
        "updated_at",
        existing_type=sa.VARCHAR(50),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::timestamptz",
    )

    # ------------------------------------------------------------------ #
    # chat_sessions — created_at (VARCHAR(50)), updated_at (VARCHAR(50))
    # ------------------------------------------------------------------ #
    op.alter_column(
        "chat_sessions",
        "created_at",
        existing_type=sa.VARCHAR(50),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::timestamptz",
    )
    op.alter_column(
        "chat_sessions",
        "updated_at",
        existing_type=sa.VARCHAR(50),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::timestamptz",
    )

    # ------------------------------------------------------------------ #
    # context_documents — uploaded_at (String), indexed_at (String, nullable)
    # ------------------------------------------------------------------ #
    op.alter_column(
        "context_documents",
        "uploaded_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="uploaded_at::timestamptz",
    )
    op.alter_column(
        "context_documents",
        "indexed_at",
        existing_type=sa.String(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="indexed_at::timestamptz",
    )


def downgrade() -> None:
    # ------------------------------------------------------------------ #
    # context_documents
    # ------------------------------------------------------------------ #
    op.alter_column(
        "context_documents",
        "indexed_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=True,
        postgresql_using="indexed_at::text",
    )
    op.alter_column(
        "context_documents",
        "uploaded_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="uploaded_at::text",
    )

    # ------------------------------------------------------------------ #
    # chat_sessions
    # ------------------------------------------------------------------ #
    op.alter_column(
        "chat_sessions",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.VARCHAR(50),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::varchar",
    )
    op.alter_column(
        "chat_sessions",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.VARCHAR(50),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::varchar",
    )

    # ------------------------------------------------------------------ #
    # analyses
    # ------------------------------------------------------------------ #
    op.alter_column(
        "analyses",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.VARCHAR(50),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::varchar",
    )
    op.alter_column(
        "analyses",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.VARCHAR(50),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::varchar",
    )

    # ------------------------------------------------------------------ #
    # users
    # ------------------------------------------------------------------ #
    op.alter_column(
        "users",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::text",
    )
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::text",
    )

    # ------------------------------------------------------------------ #
    # terms
    # ------------------------------------------------------------------ #
    op.alter_column(
        "terms",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="updated_at::text",
    )
    op.alter_column(
        "terms",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
        postgresql_using="created_at::text",
    )
