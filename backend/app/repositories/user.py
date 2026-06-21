import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:

    @staticmethod
    async def get_by_id(session: AsyncSession, user_id: str) -> User | None:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_matricula(session: AsyncSession, matricula: str) -> User | None:
        result = await session.execute(select(User).where(User.matricula == matricula))
        return result.scalar_one_or_none()

    @staticmethod
    async def create(session: AsyncSession, data: dict) -> User:
        user = User(**data)
        session.add(user)
        await session.flush()
        return user

    @staticmethod
    async def list_all(session: AsyncSession) -> list[User]:
        """Retorna todos os usuários ordenados por nome."""
        result = await session.execute(select(User).order_by(User.nome))
        return list(result.scalars().all())

    @staticmethod
    async def update(session: AsyncSession, user_id: uuid.UUID, data: dict) -> User | None:
        """Atualiza campos de um usuário. Retorna None se não encontrado."""
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return None
        for key, value in data.items():
            setattr(user, key, value)
        await session.flush()
        return user
