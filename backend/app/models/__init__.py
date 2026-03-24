"""
Pacote de models SQLAlchemy.

Importamos todos os models aqui para que o Alembic os descubra
automaticamente ao gerar migrations.

Por que importar aqui?
  O Alembic usa `Base.metadata` para saber quais tabelas existem.
  Se um model não for importado, o Alembic não o vê e não gera
  a migration correspondente. Este __init__.py garante que todos
  os models sejam carregados quando o pacote é importado.
"""

from app.models.analysis import Analysis  # noqa: F401
from app.models.chat_session import ChatSession  # noqa: F401
from app.models.term import Term  # noqa: F401

__all__ = ["Term", "Analysis", "ChatSession"]
