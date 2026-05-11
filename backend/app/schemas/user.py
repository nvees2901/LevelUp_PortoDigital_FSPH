from typing import Any

from pydantic import BaseModel, Field, field_validator


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
