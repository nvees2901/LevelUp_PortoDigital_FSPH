"""
analysis.py (schemas) — Contratos Pydantic para Análise de Conformidade

Representa o resultado da análise de um TR contra os 10 critérios
da Lei 14.133/2021, conforme definido no CONTEXT.md (seção 6.2).
"""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------ #
# Sub-schemas (blocos reutilizáveis)
# ------------------------------------------------------------------ #

class CriterionResult(BaseModel):
    """
    Resultado de UM critério específico da Lei 14.133.

    Exemplo de payload retornado ao frontend:
    {
      "criterio": "objeto_descricao",
      "artigo": "Art. 6º, XXIII, a",
      "descricao": "Descrição clara e precisa do objeto da contratação",
      "status": "alerta",
      "score": 6,
      "sugestao": "Inclua especificações técnicas detalhadas do objeto..."
    }
    """

    criterio: str = Field(description="Nome interno do critério (snake_case)")
    artigo: str = Field(description="Artigo da Lei 14.133/2021 correspondente")
    descricao: str = Field(description="Descrição do que o critério avalia")
    status: str = Field(
        description="Resultado: 'aprovado' (>=8), 'alerta' (5-7), 'reprovado' (<5)"
    )
    score: int = Field(ge=0, le=10, description="Pontuação de 0 a 10")
    sugestao: str | None = Field(
        default=None,
        description="Sugestão de melhoria (apenas para alerta ou reprovado)",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = {"aprovado", "alerta", "reprovado"}
        if v not in valid:
            raise ValueError(f"Status inválido: {v}")
        return v


class Suggestion(BaseModel):
    """Uma sugestão de melhoria priorizada por impacto no score."""

    prioridade: int = Field(ge=1, description="1 = mais crítica")
    criterio: str = Field(description="Critério que originou a sugestão")
    artigo: str = Field(description="Artigo da Lei correspondente")
    descricao: str = Field(description="Descrição da melhoria necessária")


# ------------------------------------------------------------------ #
# Schema de resposta principal
# ------------------------------------------------------------------ #

class AnalysisResponse(BaseModel):
    """
    Resposta completa de uma análise de conformidade.

    Retornado por:
      - POST /api/v1/upload   (análise automática após upload)
      - POST /api/v1/analysis (análise de TR já existente)
      - GET  /api/v1/analysis/{id}
    """

    id: str = Field(description="UUID da análise")
    term_id: str = Field(description="UUID do TR analisado")

    # --- Score e status geral ---
    compliance_score: Decimal = Field(
        description="Score de conformidade de 0.00 a 100.00",
        examples=[72.50],
    )
    status: str = Field(
        description="'aprovado' (>=80), 'alerta' (50-79), 'reprovado' (<50)"
    )

    # --- Detalhamento por critério ---
    criteria_results: list[CriterionResult] = Field(
        description="Resultado individual dos 10 critérios da Lei 14.133"
    )

    # --- Sugestões priorizadas ---
    suggestions: list[Suggestion] = Field(
        description="Lista de melhorias ordenadas por impacto no score"
    )

    # --- Referências legais utilizadas ---
    legal_references: list[str] = Field(
        description="Artigos da Lei 14.133 referenciados na análise"
    )

    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", "term_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)


class AnalysisSummary(BaseModel):
    """Versão resumida para listagens de histórico de análises."""

    id: str
    term_id: str
    compliance_score: Decimal
    status: str
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", "term_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)


# ------------------------------------------------------------------ #
# Schema de request para análise manual
# ------------------------------------------------------------------ #

class AnalysisRequest(BaseModel):
    """
    Payload para analisar um TR já cadastrado (POST /api/v1/analysis).

    Por que não enviar o conteúdo diretamente?
      O TR já está no banco com seu conteúdo extraído.
      Basta informar o ID para o backend buscar e analisar.
    """

    term_id: str = Field(description="UUID do TR a ser analisado")
