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
