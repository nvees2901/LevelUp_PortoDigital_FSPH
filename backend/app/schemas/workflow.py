"""
workflow.py (schemas) — Contratos Pydantic para o fluxo de tramitação

Cobre as ações de avanço e devolução de TRs entre setores,
e a saída de um evento de workflow para o cliente.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class AvancarRequest(BaseModel):
    """Payload para avançar um TR para o próximo setor."""

    observacao: str | None = None


class DevolverRequest(BaseModel):
    """Payload para devolver um TR ao setor anterior (motivo obrigatório)."""

    observacao: str = Field(
        ...,
        min_length=3,
        description="Motivo da devolução (obrigatório)",
    )


class WorkflowEventOut(BaseModel):
    """Representa um evento de tramitação na resposta da API."""

    id: str
    term_id: str
    # Note: ator_nome has no ORM attribute — route must populate explicitly:
    # WorkflowEventOut(**event.__dict__, ator_nome=event.ator.nome if event.ator else None)
    ator_nome: str | None = None
    de_setor: str | None = None
    para_setor: str | None = None
    acao: str
    observacao: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", "term_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        """Converte UUID do SQLAlchemy para string na resposta JSON."""
        if v is None:
            return v  # type: ignore[return-value]
        return str(v)

    @field_validator("created_at", mode="before")
    @classmethod
    def datetime_to_isoformat(cls, v: Any) -> str:
        """Converte datetime do SQLAlchemy para string ISO-8601."""
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, str):
            return v
        return str(v)
