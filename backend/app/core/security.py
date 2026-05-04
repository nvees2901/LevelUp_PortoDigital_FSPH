from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.repositories.user import UserRepository
from app.services.auth import decode_token
from app.utils.exceptions import InactiveUserError, InvalidTokenError, MissingAuthHeaderError

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise MissingAuthHeaderError()
    token = authorization.removeprefix("Bearer ")
    claims = decode_token(token)
    user_id: str | None = claims.get("sub")
    if not user_id:
        raise InvalidTokenError()
    user = await UserRepository.get_by_id(db, user_id)
    if user is None:
        raise InvalidTokenError()
    if not user.ativo:
        raise InactiveUserError()
    return user


# Tipo reutilizável para proteger endpoints futuros
CurrentUser = Annotated[User, Depends(get_current_user)]
