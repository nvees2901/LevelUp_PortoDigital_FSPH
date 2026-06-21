"""
test_users.py — Testes TDD para CRUD de gerenciamento de usuários (Task 4)

RED phase: testes escritos ANTES das rotas existirem.
Os testes falham enquanto as rotas não estão implementadas.
GREEN phase: após implementar routes/users.py, repository e schemas.

Estratégia de harness:
  - httpx.AsyncClient + ASGITransport: mantém tudo no mesmo event loop
  - app.dependency_overrides: substitui get_current_user, require_admin e get_db
  - Sessão SQLite própria para users (evita JSONB do terms no create_all)
  - Fixture cleanup garante limpeza de overrides após cada teste
"""

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.main import app
from app.models.user import User


# ======================================================================== #
# Fixture: sessão SQLite in-memory somente para a tabela users
# ======================================================================== #

@pytest_asyncio.fixture
async def user_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Sessão SQLite em memória criando apenas a tabela 'users'.

    Não usa Base.metadata.create_all() pois outras tabelas têm colunas
    PostgreSQL-específicas (JSONB) incompatíveis com SQLite.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    # Cria apenas a tabela users no SQLite
    async with engine.begin() as conn:
        await conn.run_sync(User.__table__.create, checkfirst=True)

    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    await engine.dispose()


# ======================================================================== #
# Helpers
# ======================================================================== #

def make_admin_user() -> MagicMock:
    """Cria um mock de User com is_admin=True e UUID fixo."""
    user = MagicMock(spec=User)
    user.id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    user.is_admin = True
    user.ativo = True
    return user


def make_regular_user() -> MagicMock:
    """Cria um mock de User sem is_admin."""
    user = MagicMock(spec=User)
    user.id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    user.is_admin = False
    user.ativo = True
    return user


# ======================================================================== #
# Fixture: cliente HTTP com DB in-memory e admin autenticado
# ======================================================================== #

@pytest_asyncio.fixture
async def admin_client(user_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient com:
    - DB substituído pelo user_session (SQLite in-memory, somente users)
    - get_current_user e require_admin retornando usuário admin mock
    Dependency overrides são limpos após o teste.
    """
    admin = make_admin_user()

    app.dependency_overrides[get_db] = lambda: user_session
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def nonadmin_client(user_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient onde require_admin lança HTTPException(403).
    Simula um usuário autenticado mas sem privilégio de admin.
    """
    from fastapi import HTTPException

    regular = make_regular_user()

    app.dependency_overrides[get_db] = lambda: user_session
    app.dependency_overrides[get_current_user] = lambda: regular
    app.dependency_overrides[require_admin] = lambda: (_ for _ in ()).throw(
        HTTPException(status_code=403, detail="Acesso restrito a administradores.")
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ======================================================================== #
# Helper: seed de usuário diretamente no banco
# ======================================================================== #

async def seed_user(session: AsyncSession, **kwargs) -> User:
    """Cria um usuário diretamente no banco in-memory para setup de testes."""
    from app.repositories.user import UserRepository
    from app.services.auth import hash_password

    defaults = {
        "matricula": f"M{uuid.uuid4().hex[:8]}",
        "senha_hash": hash_password("senha123"),
        "nome": "Usuário Teste",
        "setor_id": "demandante",
        "subunidade": None,
        "is_admin": False,
        "ativo": True,
    }
    defaults.update(kwargs)
    user = await UserRepository.create(session, defaults)
    await session.flush()
    return user


# ======================================================================== #
# Teste 1: GET /api/v1/admin/users → lista vazia para admin
# ======================================================================== #

@pytest.mark.asyncio
async def test_list_users_empty(admin_client: AsyncClient):
    """GET /api/v1/admin/users retorna lista vazia quando não há usuários."""
    response = await admin_client.get("/api/v1/admin/users")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


# ======================================================================== #
# Teste 2: POST /api/v1/admin/users → cria usuário com sucesso (201)
# ======================================================================== #

@pytest.mark.asyncio
async def test_create_user_success(admin_client: AsyncClient):
    """POST /api/v1/admin/users cria um usuário e retorna 201 com dados."""
    payload = {
        "matricula": "MAT001",
        "senha": "senha123",
        "nome": "João da Silva",
        "setor_id": "dirop",
        "subunidade": None,
        "is_admin": False,
    }
    response = await admin_client.post("/api/v1/admin/users", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["matricula"] == "MAT001"
    assert data["nome"] == "João da Silva"
    assert data["setor_id"] == "dirop"
    assert "id" in data
    # senha não deve aparecer no response
    assert "senha" not in data
    assert "senha_hash" not in data


# ======================================================================== #
# Teste 3: POST /api/v1/admin/users → 409 para matrícula duplicada
# ======================================================================== #

@pytest.mark.asyncio
async def test_create_user_duplicate_matricula(
    admin_client: AsyncClient, user_session: AsyncSession
):
    """POST /api/v1/admin/users retorna 409 quando matrícula já existe."""
    await seed_user(user_session, matricula="DUPLIC01")
    await user_session.commit()

    payload = {
        "matricula": "DUPLIC01",
        "senha": "outrasenha",
        "nome": "Outro Nome",
        "setor_id": "diraf",
    }
    response = await admin_client.post("/api/v1/admin/users", json=payload)

    assert response.status_code == 409


# ======================================================================== #
# Teste 4: PUT /api/v1/admin/users/{id} → atualiza campos
# ======================================================================== #

@pytest.mark.asyncio
async def test_update_user(admin_client: AsyncClient, user_session: AsyncSession):
    """PUT /api/v1/admin/users/{id} atualiza nome e setor_id."""
    user = await seed_user(user_session, nome="Nome Antigo", setor_id="demandante")
    await user_session.commit()

    payload = {"nome": "Nome Atualizado", "setor_id": "colic"}
    response = await admin_client.put(
        f"/api/v1/admin/users/{user.id}", json=payload
    )

    assert response.status_code == 200
    data = response.json()
    assert data["nome"] == "Nome Atualizado"
    assert data["setor_id"] == "colic"


# ======================================================================== #
# Teste 5: DELETE /api/v1/admin/users/{id} → desativa usuário (204)
# ======================================================================== #

@pytest.mark.asyncio
async def test_deactivate_user(admin_client: AsyncClient, user_session: AsyncSession):
    """DELETE /api/v1/admin/users/{id} retorna 204 e marca ativo=False."""
    from app.repositories.user import UserRepository

    user = await seed_user(user_session, ativo=True)
    await user_session.commit()

    response = await admin_client.delete(f"/api/v1/admin/users/{user.id}")

    assert response.status_code == 204

    # Verifica no banco que ativo=False — passamos UUID diretamente (SQLite não aceita str)
    from sqlalchemy import select
    result = await user_session.execute(
        select(User).where(User.id == user.id)
    )
    updated = result.scalar_one_or_none()
    assert updated is not None
    assert updated.ativo is False


# ======================================================================== #
# Teste 6: DELETE /api/v1/admin/users/{own_id} → 400 (auto-desativação bloqueada)
# ======================================================================== #

@pytest.mark.asyncio
async def test_deactivate_self_returns_400(admin_client: AsyncClient):
    """DELETE /api/v1/admin/users/{own_id} retorna 400 se usuário tenta se desativar."""
    # O admin_client usa admin com id 00000000-0000-0000-0000-000000000001
    own_id = "00000000-0000-0000-0000-000000000001"
    response = await admin_client.delete(f"/api/v1/admin/users/{own_id}")

    assert response.status_code == 400


# ======================================================================== #
# Teste 7: GET /api/v1/admin/users → 403 para não-admin
# ======================================================================== #

@pytest.mark.asyncio
async def test_list_users_forbidden_for_nonadmin(nonadmin_client: AsyncClient):
    """GET /api/v1/admin/users retorna 403 para usuário sem is_admin."""
    response = await nonadmin_client.get("/api/v1/admin/users")

    assert response.status_code == 403
