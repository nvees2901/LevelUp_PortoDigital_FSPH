"""
database.py — Conexão assíncrona com o PostgreSQL

Por que async?
  FastAPI é um framework ASGI (Asynchronous Server Gateway Interface).
  Operações bloqueantes (como queries ao banco) travam o servidor para TODOS
  os usuários enquanto aguardam resposta. Com async/await, o servidor libera
  a thread e atende outras requisições enquanto espera o banco responder.

Componentes criados aqui:
  1. engine      — a "conexão de baixo nível" com o banco
  2. AsyncSession — cada requisição HTTP recebe uma sessão isolada
  3. Base        — classe pai de todos os Models SQLAlchemy
  4. get_db()    — dependency do FastAPI que abre/fecha sessão por request
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ------------------------------------------------------------------ #
# Engine — a conexão de baixo nível com o PostgreSQL
# ------------------------------------------------------------------ #
# pool_pre_ping=True: verifica se a conexão ainda está viva antes de usar
#   (importante para conexões longas que podem expirar)
# echo=True em dev: imprime todas as queries SQL no console
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG,  # loga queries apenas em modo debug
    pool_size=10,         # máximo de conexões simultâneas no pool
    max_overflow=20,      # conexões extras além do pool_size em pico
)

# ------------------------------------------------------------------ #
# Session Factory — fábrica de sessões assíncronas
# ------------------------------------------------------------------ #
# expire_on_commit=False: mantém os objetos acessíveis após o commit
#   (necessário em APIs async onde o objeto pode ser usado para montar a resposta)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ------------------------------------------------------------------ #
# Base — classe pai de todos os Models SQLAlchemy
# ------------------------------------------------------------------ #
# Todos os models herdam de Base:
#   class Term(Base): ...
#   class Analysis(Base): ...
# Isso permite que o Alembic descubra as tabelas automaticamente
class Base(DeclarativeBase):
    pass


# ------------------------------------------------------------------ #
# Dependency do FastAPI — injeção de sessão por request
# ------------------------------------------------------------------ #
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency que fornece uma sessão de banco isolada por requisição HTTP.

    Como funciona:
      1. FastAPI chama esta função antes de executar o endpoint
      2. Uma sessão é criada e injetada no parâmetro `db: AsyncSession`
      3. O endpoint usa a sessão para fazer queries
      4. Após o endpoint retornar (com sucesso ou erro), o `finally` fecha a sessão

    Uso nos endpoints:
      @router.get("/terms")
      async def list_terms(db: AsyncSession = Depends(get_db)):
          ...

    Por que usar yield e não return?
      yield transforma esta função em um context manager assíncrono.
      O código APÓS o yield é garantidamente executado (mesmo em exceções),
      funcionando como um bloco finally.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()  # desfaz alterações em caso de erro
            raise
        finally:
            await session.close()    # libera a conexão de volta ao pool
