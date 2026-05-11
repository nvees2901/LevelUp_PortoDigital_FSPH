from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.repositories.user import UserRepository
from app.utils.exceptions import InactiveUserError, InvalidCredentialsError, InvalidTokenError

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "matricula": user.matricula,
        "setor_id": user.setor_id,
        "exp": exp,
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise InvalidTokenError()
    except jwt.PyJWTError:
        raise InvalidTokenError()


async def authenticate_user(db: AsyncSession, matricula: str, senha: str) -> User:
    user = await UserRepository.get_by_matricula(db, matricula)
    # Mensagem genérica: não revela se a matrícula existe ou não
    if user is None or not verify_password(senha, user.senha_hash):
        raise InvalidCredentialsError()
    if not user.ativo:
        raise InactiveUserError()
    return user
