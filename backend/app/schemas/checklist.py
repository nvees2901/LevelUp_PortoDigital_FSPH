"""
checklist.py (schemas) — Contratos Pydantic para o checklist de documentos

Expõe o estado de cada documento obrigatório de um TR,
e permite atualizações parciais (PATCH semântico).
"""

from typing import Any

from pydantic import BaseModel, field_validator


class TermChecklistOut(BaseModel):
    """Representação completa do checklist de um TR na resposta da API."""

    term_id: str
    dfd: bool
    etp: bool
    tr: bool
    dotacao: bool
    auth_dirop: bool
    auth_diraf: bool
    auth_diger: bool
    updated_at: str

    model_config = {"from_attributes": True}

    @field_validator("term_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        """Converte UUID do SQLAlchemy para string na resposta JSON."""
        return str(v)


class TermChecklistUpdate(BaseModel):
    """
    Payload de atualização parcial do checklist (PATCH).
    Todos os campos são opcionais — atualiza apenas o que for enviado.
    """

    dfd: bool | None = None
    etp: bool | None = None
    tr: bool | None = None
    dotacao: bool | None = None
    auth_dirop: bool | None = None
    auth_diraf: bool | None = None
    auth_diger: bool | None = None
