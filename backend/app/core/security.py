from typing import Annotated

from fastapi import Depends, Header, HTTPException
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


async def require_admin(current_user: CurrentUser) -> User:
    """Dependência que garante que o usuário autenticado tem papel de administrador."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
    return current_user


# Tipo reutilizável para endpoints exclusivos de administradores
AdminUser = Annotated[User, Depends(require_admin)]
