"""
term.py (schemas) — Contratos Pydantic para a entidade Termo de Referência

Por que schemas separados dos models SQLAlchemy?
  - Models SQLAlchemy = estrutura do BANCO (colunas, relacionamentos, índices)
  - Schemas Pydantic  = estrutura da API  (o que entra e o que sai via HTTP)
  
  Sem essa separação:
  - Exporia campos internos (ex: file_path, id do banco) para o cliente
  - Impossibilitaria validações diferentes por operação (create vs update)
  - Impediria que a API evolua independente do banco

Padrão de nomenclatura:
  - *Base    → campos comuns herdados por outros schemas
  - *Create  → payload de criação (POST)
  - *Update  → payload de atualização (PUT) — todos opcionais
  - *Response → resposta da API (o que o cliente recebe)
  - *ListResponse → resposta paginada de listagens (GET com filtros)
"""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------ #
# Schemas de entrada (Request)
# ------------------------------------------------------------------ #

class TermBase(BaseModel):
    """Campos comuns entre criação e atualização."""

    title: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Título/objeto do Termo de Referência",
        examples=["Contratação de serviço de capacitação em gestão pública"],
    )

    category: str = Field(
        default="outro",
        description="Categoria do TR",
        examples=["capacitacao", "aquisicao", "servico_tecnico", "outro"],
    )

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        """Garante que apenas categorias válidas sejam aceitas."""
        valid = {"capacitacao", "aquisicao", "servico_tecnico", "outro"}
        if v not in valid:
            raise ValueError(f"Categoria inválida. Use: {', '.join(sorted(valid))}")
        return v


class TermCreate(TermBase):
    """
    Payload para criação manual de um TR (POST /api/v1/terms).
    
    O conteúdo é opcional aqui pois o TR pode ser criado:
    - Manualmente via este endpoint (conteúdo preenchido pelo usuário)
    - Via upload de documento (conteúdo extraído automaticamente pelo backend)
    - Via chat IA (conteúdo gerado pela IA)
    """

    content: str | None = Field(
        default=None,
        description="Conteúdo textual do TR (opcional no cadastro manual)",
    )

    estimated_value: Decimal | None = Field(
        default=None,
        ge=0,
        description="Valor estimado da contratação em reais",
        examples=[50000.00],
    )


class TermUpdate(BaseModel):
    """
    Payload de atualização (PUT /api/v1/terms/{id}).
    Todos os campos são opcionais — atualiza apenas o que for enviado.
    
    Por que não herdar de TermBase?
      TermBase tem campos obrigatórios (title, category).
      Em um PUT parcial, o cliente pode enviar apenas o que mudou.
    """

    title: str | None = Field(None, min_length=5, max_length=500)
    category: str | None = None
    status: str | None = None
    content: str | None = None
    estimated_value: Decimal | None = Field(None, ge=0)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is None:
            return v
        valid = {"capacitacao", "aquisicao", "servico_tecnico", "outro"}
        if v not in valid:
            raise ValueError(f"Categoria inválida. Use: {', '.join(sorted(valid))}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return v
        valid = {
            "Rascunho",
            "Aguardando DIROP",
            "Aguardando DIRAF",
            "Aguardando DIGER",
            "Instrução COLIC",
            "Aguardando Jurídico",
            "Aprovação DIRAF/DIGER",
            "Homologado",
        }
        if v not in valid:
            raise ValueError("Status inválido. Use um dos valores do fluxo de tramitação.")
        return v


# ------------------------------------------------------------------ #
# Schemas de saída (Response)
# ------------------------------------------------------------------ #

class TermResponse(BaseModel):
    """
    Resposta completa de um TR (GET /api/v1/terms/{id}).

    model_config com from_attributes=True:
      Permite criar este schema diretamente de um objeto SQLAlchemy:
        term_obj = await repo.get_by_id(db, id)
        response = TermResponse.model_validate(term_obj)  # funciona!
    """

    id: str = Field(description="UUID do termo")
    title: str
    category: str
    status: str
    setor_atual: str
    created_by_id: str | None = None
    content: str | None = None
    sections: dict[str, Any] | None = None
    variable_fields: list[str] | None = None
    estimated_value: Decimal | None = None
    original_filename: str | None = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", "created_by_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str | None:
        """Converte UUID do SQLAlchemy para string na resposta JSON."""
        if v is None:
            return None
        return str(v)


class TermSummary(BaseModel):
    """
    Versão resumida para listagens e dashboard (menos dados, mais rápido).
    Não inclui `content` (pode ser muito grande) nem `sections`.
    """

    id: str
    title: str
    category: str
    status: str
    setor_atual: str
    estimated_value: Decimal | None = None
    original_filename: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)


class TermListResponse(BaseModel):
    """
    Resposta paginada para GET /api/v1/terms.
    
    Por que paginação?
      Uma empresa pode ter centenas de TRs. Retornar todos de uma vez
      sobrecarrega o banco e o cliente. Com paginação, o frontend
      carrega apenas o necessário.
    
    Parâmetros de query:
      GET /api/v1/terms?page=1&limit=10&category=aquisicao&search=equipamento
    """

    items: list[TermSummary]
    total: int = Field(description="Total de itens no banco (todos os filtros)")
    page: int = Field(description="Página atual (começa em 1)")
    limit: int = Field(description="Itens por página")
    pages: int = Field(description="Total de páginas")

    model_config = {"from_attributes": True}
