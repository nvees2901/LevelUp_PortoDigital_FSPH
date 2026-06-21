"""
users.py (route) — Endpoints de gerenciamento de usuários (admin only)

GET    /api/v1/admin/users         → listar todos os usuários
POST   /api/v1/admin/users         → criar novo usuário
PUT    /api/v1/admin/users/{id}    → atualizar usuário (campos opcionais)
DELETE /api/v1/admin/users/{id}    → desativar usuário (soft delete: ativo=False)
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import AdminUser
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserList, UserOut, UserUpdate
from app.services.auth import hash_password

router = APIRouter(prefix="/admin", tags=["Admin/Users"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/users", response_model=UserList)
async def list_users(db: DbDep, current_user: AdminUser):
    """Lista todos os usuários."""
    users = await UserRepository.list_all(db)
    return UserList(items=[UserOut.model_validate(u) for u in users], total=len(users))


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(payload: UserCreate, db: DbDep, current_user: AdminUser):
    """Cria um novo usuário. Retorna 409 se a matrícula já existe."""
    existing = await UserRepository.get_by_matricula(db, payload.matricula)
    if existing:
        raise HTTPException(status_code=409, detail="Matrícula já cadastrada.")
    user = await UserRepository.create(db, {
        "matricula": payload.matricula,
        "senha_hash": hash_password(payload.senha),
        "nome": payload.nome,
        "setor_id": payload.setor_id,
        "subunidade": payload.subunidade,
        "is_admin": payload.is_admin,
        "ativo": True,
    })
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, db: DbDep, current_user: AdminUser):
    """Atualiza campos opcionais de um usuário."""
    data = payload.model_dump(exclude_none=True)
    user = await UserRepository.update(db, user_id, data)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=204)
async def deactivate_user(user_id: uuid.UUID, db: DbDep, current_user: AdminUser):
    """Desativa um usuário (soft delete). Não permite desativar a si mesmo."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Não é possível desativar a própria conta.")
    user = await UserRepository.update(db, user_id, {"ativo": False})
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    await db.commit()
