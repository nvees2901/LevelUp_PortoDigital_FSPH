from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser
from app.schemas.user import LoginRequest, LoginResponse, UserOut
from app.services.auth import authenticate_user, create_access_token

router = APIRouter(prefix="/auth", tags=["Autenticação"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: DbDep):
    """
    Autentica o usuário pelas credenciais (matrícula + senha).
    Retorna um JWT e os dados do usuário, incluindo o setor derivado do cadastro.
    """
    user = await authenticate_user(db, payload.matricula, payload.senha)
    token = create_access_token(user)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def get_me(current_user: CurrentUser):
    """Retorna os dados do usuário autenticado. Usado para validar o token no startup do frontend."""
    return UserOut.model_validate(current_user)
