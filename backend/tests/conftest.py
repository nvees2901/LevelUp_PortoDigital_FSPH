"""
conftest.py — Configuração global de fixtures para testes

Este arquivo é automaticamente carregado pelo pytest antes de executar qualquer teste.
Define as fixtures compartilhadas (async_session, fake_storage) usadas por todos os testes.
"""

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base


# ====================================================================== #
# Async SQLite In-Memory Database Fixture
# ====================================================================== #
@pytest.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Fornece uma sessão de banco de dados assíncrona com SQLite em memória.

    Esta fixture é usada para testes de modelo e integração de banco de dados.
    O banco é criado fresh para cada teste (isolation) e descartado ao final.

    Tecnicamente:
      - engine: SQLite em memória (sqlite+aiosqlite:///:memory:)
      - StaticPool: mantém a mesma conexão dentro do teste (necessário para SQLite in-memory)
      - expire_on_commit=False: mantém objetos acessíveis após commit (como na produção)
      - Todas as tabelas (Base.metadata) são criadas automaticamente

    Uso nos testes:
      async def test_criar_termo(async_session: AsyncSession):
          termo = Termo(titulo="Novo Termo")
          async_session.add(termo)
          await async_session.commit()
          ...
    """
    # Cria engine com SQLite em memória
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,  # Mude para True se precisar ver queries SQL durante testes
    )

    # Cria todas as tabelas (schema) no banco em memória
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Cria a factory de sessões
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Abre uma sessão e a fornece ao teste
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    # Cleanup: fecha o engine
    await engine.dispose()


# ====================================================================== #
# Fake Storage Service
# ====================================================================== #
class FakeStorageService:
    """
    Stub em-memória para o StorageService real (a ser criado na Task 1).

    O StorageService real (app.services.storage.StorageService) será um cliente
    para Google Cloud Storage (GCS). Esta versão fake usa um simples dicionário
    em memória para simular upload/download/delete/exists sem tocar em GCS.

    Métodos (async, mesma assinatura da Task 1):
      - upload(data: bytes, object_name: str, content_type: str) -> str
        Upload de conteúdo. Retorna a URL pública (aqui, apenas o object_name).
      - download(object_name: str) -> bytes
        Download de conteúdo pelo nome do objeto.
      - delete(object_name: str) -> None
        Deleta um objeto.
      - exists(object_name: str) -> bool
        Verifica se um objeto existe.

    Uso nos testes (futuro):
      @pytest.mark.asyncio
      async def test_upload_documento(fake_storage: FakeStorageService):
          resultado = await fake_storage.upload(
              data=b"conteúdo",
              object_name="docs/termo.pdf",
              content_type="application/pdf"
          )
          assert resultado == "docs/termo.pdf"
          assert await fake_storage.exists("docs/termo.pdf")
    """

    def __init__(self) -> None:
        """Inicializa o storage fake com um dict vazio."""
        self._storage: dict[str, bytes] = {}

    async def upload(
        self, data: bytes, object_name: str, content_type: str
    ) -> str:
        """
        Faz upload de dados.

        Args:
            data: Conteúdo em bytes a ser armazenado.
            object_name: Caminho/nome do objeto no storage.
            content_type: Tipo MIME (application/pdf, image/png, etc).

        Returns:
            String representando a URL/localização do arquivo.
            No stub, retorna o object_name.
        """
        self._storage[object_name] = data
        return object_name

    async def download(self, object_name: str) -> bytes:
        """
        Faz download de dados.

        Args:
            object_name: Caminho/nome do objeto no storage.

        Returns:
            Conteúdo em bytes.

        Raises:
            KeyError: Se o objeto não existir.
        """
        if object_name not in self._storage:
            raise KeyError(f"Objeto não encontrado: {object_name}")
        return self._storage[object_name]

    async def delete(self, object_name: str) -> None:
        """
        Deleta um objeto do storage.

        Args:
            object_name: Caminho/nome do objeto no storage.

        Raises:
            KeyError: Se o objeto não existir.
        """
        if object_name not in self._storage:
            raise KeyError(f"Objeto não encontrado: {object_name}")
        del self._storage[object_name]

    async def exists(self, object_name: str) -> bool:
        """
        Verifica se um objeto existe no storage.

        Args:
            object_name: Caminho/nome do objeto no storage.

        Returns:
            True se existe, False caso contrário.
        """
        return object_name in self._storage


# ====================================================================== #
# Pytest Fixture para FakeStorageService
# ====================================================================== #
@pytest.fixture
def fake_storage() -> FakeStorageService:
    """
    Fornece uma instância fresh do FakeStorageService para cada teste.

    Uso nos testes (futuro):
      async def test_storage(fake_storage: FakeStorageService):
          await fake_storage.upload(b"data", "file.txt", "text/plain")
          assert await fake_storage.exists("file.txt")
    """
    return FakeStorageService()
