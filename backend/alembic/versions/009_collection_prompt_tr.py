"""collapse context_documents.collection into two categories: prompt | tr

Revision ID: 009
Revises: 008
Create Date: 2026-06-03

Migra as categorias da base de conhecimento de três (context_extra,
lei_14133, termos_aprovados) para duas: 'prompt' e 'tr'.
- termos_aprovados            → tr   (modelos de termo)
- lei_14133 + context_extra   → prompt (instruções/contexto da IA)
"""
from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE context_documents SET collection = 'tr' WHERE collection = 'termos_aprovados'")
    op.execute(
        "UPDATE context_documents SET collection = 'prompt' "
        "WHERE collection IN ('lei_14133', 'context_extra')"
    )
    op.execute("ALTER TABLE context_documents ALTER COLUMN collection SET DEFAULT 'prompt'")


def downgrade() -> None:
    op.execute("ALTER TABLE context_documents ALTER COLUMN collection SET DEFAULT 'context_extra'")
    op.execute("UPDATE context_documents SET collection = 'termos_aprovados' WHERE collection = 'tr'")
    op.execute("UPDATE context_documents SET collection = 'context_extra' WHERE collection = 'prompt'")
