from sqlalchemy import delete as sa_delete, select
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
        result = await session.execute(select(User).order_by(User.matricula))
        return list(result.scalars().all())

    @staticmethod
    async def update(session: AsyncSession, user: User, data: dict) -> User:
        for field, value in data.items():
            setattr(user, field, value)
        await session.flush()
        return user

    @staticmethod
    async def delete(session: AsyncSession, user: User) -> None:
        await session.execute(sa_delete(User).where(User.id == user.id))
        await session.flush()
