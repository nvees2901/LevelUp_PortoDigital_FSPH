"""
Alembic environment configuration for async SQLAlchemy.

This file configures Alembic to work with our async PostgreSQL setup.
It reads the DATABASE_URL from app settings and converts it to sync
for Alembic's migration runner (Alembic uses sync connections).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy import create_engine

from app.core.config import settings
from app.core.database import Base

# Import all models so Alembic can detect them for autogenerate
from app.models.term import Term  # noqa: F401
from app.models.analysis import Analysis  # noqa: F401
from app.models.chat_session import ChatSession  # noqa: F401
from app.models.user import User  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_sync_url() -> str:
    """Convert async URL to sync URL for Alembic."""
    url = settings.DATABASE_URL
    return url.replace("+asyncpg", "+psycopg")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Generates SQL script without connecting to the database.
    """
    url = get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates a sync engine and runs migrations with a real connection.
    """
    connectable = create_engine(
        get_sync_url(),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
