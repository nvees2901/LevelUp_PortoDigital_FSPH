import uuid

from sqlalchemy import Boolean, String, VARCHAR, Enum, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    matricula: Mapped[str] = mapped_column(
        VARCHAR(50),
        nullable=False,
        unique=True,
        index=True,
        comment="Matrícula funcional única do usuário",
    )
    senha_hash: Mapped[str] = mapped_column(
        VARCHAR(255),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(
        VARCHAR(200),
        nullable=False,
        comment="Nome completo do usuário",
    )
    # Espelha o SetorId do frontend: 'demandante'|'dirop'|'diraf'|'diger'|'colic'|'juridico'
    setor_id: Mapped[str] = mapped_column(
        Enum(
            "demandante", "dirop", "diraf", "diger", "colic", "juridico",
            name="user_setor",
        ),
        nullable=False,
        comment="Setor ao qual o usuário pertence",
    )
    subunidade: Mapped[str | None] = mapped_column(
        VARCHAR(120),
        nullable=True,
        comment="Subunidade do demandante (HEMOSE, LACEN, SVO, Área Administrativa)",
    )
    ativo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
        comment="Papel administrativo — pode gerenciar documentos de contexto da IA",
    )
    created_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[str] = mapped_column(
        String,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User matricula={self.matricula!r} setor={self.setor_id}>"
