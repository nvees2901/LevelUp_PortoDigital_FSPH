from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


SetorIdLiteral = Literal["demandante", "dirop", "diraf", "diger", "colic", "juridico"]


class LoginRequest(BaseModel):
    matricula: str = Field(..., min_length=1, max_length=50, description="Matrícula funcional")
    senha: str = Field(..., min_length=1, description="Senha do usuário")


class UserOut(BaseModel):
    id: str = Field(description="UUID do usuário")
    matricula: str
    nome: str
    setor_id: str
    subunidade: str | None = None
    ativo: bool = True
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
    matricula: str = Field(..., min_length=1, max_length=50, description="Matrícula única do usuário")
    senha: str = Field(..., min_length=4, description="Senha em texto plano (será hasheada)")
    nome: str = Field(..., min_length=1, max_length=200)
    setor_id: SetorIdLiteral
    subunidade: Optional[str] = Field(None, max_length=120)
    is_admin: bool = False


class UserUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=200)
    setor_id: Optional[SetorIdLiteral] = None
    subunidade: Optional[str] = Field(None, max_length=120)
    ativo: Optional[bool] = None
    is_admin: Optional[bool] = None
    # Sem campo senha — reset de senha fora do escopo MVP


class UserList(BaseModel):
    items: list[UserOut]
    total: int
