from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

SetorId = Literal["demandante", "dirop", "diraf", "diger", "colic", "juridico"]


class LoginRequest(BaseModel):
    matricula: str = Field(..., min_length=1, max_length=50, description="Matrícula funcional")
    senha: str = Field(..., min_length=1, description="Senha do usuário")


class UserOut(BaseModel):
    id: str = Field(description="UUID do usuário")
    matricula: str
    nome: str
    setor_id: str
    subunidade: str | None = None
    is_admin: bool = False

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    matricula: str = Field(..., min_length=1, max_length=50)
    nome: str = Field(..., min_length=1, max_length=200)
    senha: str = Field(..., min_length=6)
    setor_id: SetorId
    subunidade: str | None = Field(None, max_length=120)
    is_admin: bool = False


class UserAdminOut(BaseModel):
    id: str
    matricula: str
    nome: str
    setor_id: str
    subunidade: str | None = None
    is_admin: bool = False
    ativo: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)


class UserUpdate(BaseModel):
    nome: str | None = Field(None, min_length=1, max_length=200)
    senha: str | None = Field(None, min_length=6)
    setor_id: SetorId | None = None
    subunidade: str | None = Field(None, max_length=120)
    is_admin: bool | None = None
    ativo: bool | None = None
