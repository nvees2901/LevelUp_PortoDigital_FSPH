"""
chat_session.py — Model SQLAlchemy para a tabela `chat_sessions`

Representa uma sessão de conversa com o assistente IA.
Cada sessão tem um modo fixo (gerar / analisar / consultar)
e armazena o histórico completo de mensagens em JSONB.

Por que armazenar histórico em JSONB e não em tabela separada?
  - O histórico de chat é sempre lido/escrito INTEIRO (não por mensagem)
  - JSONB é ideal para listas sem necessidade de JOINs
  - Evita uma tabela `messages` com milhares de linhas pequenas
  - A lista de mensagens segue o formato da OpenAI API nativamente:
    [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
"""

import uuid

from sqlalchemy import VARCHAR, Enum, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ChatSession(Base):
    """
    Tabela `chat_sessions` — sessões de conversa com o assistente IA.

    Modos de chat (HU-02):
      - 'gerar'    → IA conduz conversa para criar um novo TR
      - 'analisar' → IA analisa um TR fornecido pelo usuário
      - 'consultar'→ IA responde perguntas sobre a base de TRs

    Estrutura do JSONB `messages`:
    [
      {"role": "system", "content": "Você é especialista em Lei 14.133..."},
      {"role": "user", "content": "Quero criar um TR para contratação de..."},
      {"role": "assistant", "content": "Certo! Qual é o objeto da contratação?"}
    ]

    O campo `generated_term_id` é preenchido quando o modo 'gerar'
    resulta em um TR salvo na base de dados.
    """

    __tablename__ = "chat_sessions"

    # --- Identificação ---
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )

    # --- Modo da sessão (fixo — não muda após criação) ---
    mode: Mapped[str] = mapped_column(
        Enum("gerar", "analisar", "consultar", name="chat_mode"),
        nullable=False,
        comment="Modo de operação do chat: gerar, analisar ou consultar",
    )

    # --- Histórico de mensagens ---
    # Formato compatível com a OpenAI Chat Completions API
    messages: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Histórico [{role: user|assistant|system, content: str}]",
    )

    # --- TR gerado (apenas quando mode='gerar' e usuário confirma) ---
    generated_term_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("terms.id", ondelete="SET NULL"),
        nullable=True,
        comment="ID do TR gerado por esta sessão (apenas modo 'gerar')",
    )

    # --- Dono da sessão ---
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="Usuário dono desta sessão",
    )

    # --- Título (derivado da 1ª mensagem) ---
    title: Mapped[str | None] = mapped_column(
        VARCHAR(120),
        nullable=True,
        comment="Título derivado da 1ª mensagem do usuário",
    )

    # --- TR vinculado (modo analisar) ---
    term_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("terms.id", ondelete="SET NULL"),
        nullable=True,
        comment="TR vinculado (modo analisar)",
    )

    # --- Timestamps ---
    created_at: Mapped[str] = mapped_column(
        VARCHAR(50),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[str] = mapped_column(
        VARCHAR(50),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # --- Relacionamentos ---
    # SET NULL: deletar o TR não deleta a sessão de chat
    # foreign_keys obrigatório: duas FKs apontam para terms.id
    generated_term: Mapped["Term | None"] = relationship(  # type: ignore[name-defined]
        "Term",
        foreign_keys=[generated_term_id],
        back_populates="chat_sessions",
    )

    analyzed_term: Mapped["Term | None"] = relationship(  # type: ignore[name-defined]
        "Term",
        foreign_keys=[term_id],
        lazy="select",
    )

    user: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[user_id],
        lazy="select",
    )

    # ------------------------------------------------------------------ #
    # Métodos auxiliares
    # ------------------------------------------------------------------ #

    def add_message(self, role: str, content: str) -> None:
        """
        Adiciona uma mensagem ao histórico da sessão.

        Uso:
            session_model.add_message("user", "Quero criar um TR...")
            session_model.add_message("assistant", "Certo! Qual o objeto?")

        Por que um método aqui?
          Garante que o formato esteja sempre correto e que o JSONB
          seja marcado como modificado pelo SQLAlchemy (necessário para
          detectar mudanças em campos JSONB).
        """
        # SQLAlchemy só detecta mudança em JSONB se criarmos uma nova lista
        self.messages = [*self.messages, {"role": role, "content": content}]

    @property
    def message_count(self) -> int:
        """Retorna o número de mensagens na sessão (excluindo system prompt)."""
        return sum(1 for m in self.messages if m.get("role") != "system")

    def __repr__(self) -> str:
        return (
            f"<ChatSession id={self.id} mode={self.mode} "
            f"messages={self.message_count}>"
        )
