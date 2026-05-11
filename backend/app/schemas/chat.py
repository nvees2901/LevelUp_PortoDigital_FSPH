"""
chat.py (schemas) — Contratos Pydantic para o Chat IA

Representa as mensagens trocadas com o assistente IA (HU-02).
O formato é compatível com a OpenAI Chat Completions API,
o que facilita a integração direta sem transformações extras.
"""

import uuid
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


# ------------------------------------------------------------------ #
# Schemas de mensagem
# ------------------------------------------------------------------ #

class ChatMessage(BaseModel):
    """
    Uma mensagem individual no histórico da conversa.
    Formato compatível com OpenAI API: {"role": "user|assistant", "content": "..."}
    """

    role: str = Field(description="'user' ou 'assistant'")
    content: str = Field(min_length=1, description="Conteúdo da mensagem")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid = {"user", "assistant", "system"}
        if v not in valid:
            raise ValueError(f"Role inválido. Use: {', '.join(sorted(valid))}")
        return v


# ------------------------------------------------------------------ #
# Schemas de request
# ------------------------------------------------------------------ #

class ChatRequest(BaseModel):
    """
    Payload para enviar uma mensagem ao chat (POST /api/v1/chat).

    Fluxo:
      1ª mensagem: omite session_id → backend cria uma nova sessão
      Mensagens seguintes: inclui session_id → continua a conversa

    Modos disponíveis (HU-02):
      'gerar'    → IA conduz conversa para criar um novo TR completo
      'analisar' → IA analisa um TR fornecido na conversa
      'consultar'→ IA responde perguntas sobre TRs cadastrados
    """

    message: str = Field(
        min_length=1,
        max_length=4000,
        description="Mensagem enviada pelo usuário",
        examples=["Quero criar um TR para contratação de serviço de TI"],
    )

    mode: str = Field(
        default="gerar",
        description="Modo do chat: 'gerar', 'analisar' ou 'consultar'",
    )

    session_id: str | None = Field(
        default=None,
        description="ID da sessão existente. Omita para iniciar nova conversa.",
    )

    term_id: str | None = Field(
        default=None,
        description="ID do TR a analisar (modo analisar)",
    )

    @field_validator("session_id", "term_id", mode="before")
    @classmethod
    def validate_uuid_fields(cls, v: Any) -> str | None:
        if v is None:
            return None
        try:
            uuid.UUID(str(v))
        except (ValueError, AttributeError):
            raise ValueError("Must be a valid UUID")
        return str(v)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        valid = {"gerar", "analisar", "consultar"}
        if v not in valid:
            raise ValueError(f"Modo inválido. Use: {', '.join(sorted(valid))}")
        return v

    @model_validator(mode="after")
    def term_id_only_for_analisar(self) -> "ChatRequest":
        if self.term_id and self.mode != "analisar":
            raise ValueError("term_id is only valid when mode='analisar'")
        return self


# ------------------------------------------------------------------ #
# Schemas de response
# ------------------------------------------------------------------ #

class ChatResponse(BaseModel):
    """
    Resposta do assistente IA (POST /api/v1/chat).

    generated_term_id é preenchido quando:
      - O modo é 'gerar'
      - A IA completou a geração do TR
      - O TR foi salvo automaticamente na base de dados
    """

    message: str = Field(description="Resposta do assistente IA")
    session_id: str = Field(description="ID da sessão (para continuar a conversa)")
    mode: str = Field(description="Modo ativo da sessão")
    generated_term_id: str | None = Field(
        default=None,
        description="UUID do TR gerado (apenas quando modo='gerar' e TR finalizado)",
    )


class ChatFinalizeResponse(BaseModel):
    """
    Resposta de POST /api/v1/chat/{session_id}/finalize.
    Retorna o UUID do TR criado (ou já existente) a partir da sessão.
    """

    term_id: str = Field(description="UUID do TR gerado a partir da sessão de chat")


class ChatSessionResponse(BaseModel):
    """
    Resposta de GET /api/v1/chat/{session_id}.
    Retorna os metadados da sessão com o histórico completo.
    """

    id: str
    mode: str
    messages: list[ChatMessage]
    generated_term_id: str | None = None
    message_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str:
        return str(v)

    @field_validator("generated_term_id", mode="before")
    @classmethod
    def optional_uuid_to_str(cls, v: Any) -> str | None:
        return str(v) if v is not None else None


class ChatSessionSummary(BaseModel):
    """
    Resumo de uma sessão para a listagem GET /api/v1/chat/sessions.
    Não inclui o histórico completo de mensagens.
    """

    id: str
    mode: str
    title: str | None = None
    message_count: int
    generated_term_id: str | None = None
    term_id: str | None = None
    updated_at: str

    model_config = {"from_attributes": True}

    @field_validator("id", "generated_term_id", "term_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v: Any) -> str | None:
        return str(v) if v is not None else None


class ChatSessionListResponse(BaseModel):
    """Resposta de GET /api/v1/chat/sessions."""

    items: list[ChatSessionSummary]
