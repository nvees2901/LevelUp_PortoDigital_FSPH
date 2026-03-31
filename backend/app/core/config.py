"""
config.py — Configurações centralizadas da aplicação

Por que pydantic-settings?
  - Lê variáveis de ambiente e do arquivo .env automaticamente
  - Valida tipos em tempo de inicialização (falha rápido se algo estiver errado)
  - Autocompletion e type hints em todo o projeto
  - Um único lugar para todas as configs — sem os_getenv espalhados pelo código
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Raiz do projeto (backend/../ → raiz do monorepo)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    # ------------------------------------------------------------------ #
    # Banco de dados
    # ------------------------------------------------------------------ #
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/fsph"
    # "postgresql+asyncpg" é o driver async do SQLAlchemy para PostgreSQL
    # Em produção, este valor vem do .env — nunca hardcode credenciais

    # ------------------------------------------------------------------ #
    # Inteligência Artificial — Ollama (local, mais rápido)
    # ------------------------------------------------------------------ #
    OLLAMA_BASE_URL: str = ""       # Ex: "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2"  # Modelo instalado no Ollama

    # ------------------------------------------------------------------ #
    # Inteligência Artificial — OpenRouter
    # ------------------------------------------------------------------ #
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Legacy OpenAI (mantido para compatibilidade, preferir OpenRouter)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # ------------------------------------------------------------------ #
    # RAG / Banco Vetorial
    # ------------------------------------------------------------------ #
    RAG_ENABLED: bool = False   # True para usar RAG (requer ChromaDB rodando)
    CHROMA_HOST: str = "localhost"  # host do ChromaDB server (Docker: "chromadb")
    CHROMA_PORT: int = 8100        # porta do ChromaDB server (Docker interna: 8000)
    DOCS_PATH: str = str(_PROJECT_ROOT / "docs")  # pasta com Lei 14133 e TRs aprovados

    # ------------------------------------------------------------------ #
    # Segurança
    # ------------------------------------------------------------------ #
    SECRET_KEY: str = "change-me-in-production-use-random-256-bit-string"
    # Usado para assinar tokens JWT no futuro. DEVE ser alterado em produção.

    # ------------------------------------------------------------------ #
    # Aplicação
    # ------------------------------------------------------------------ #
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # "development" | "production" | "test"
    APP_NAME: str = "FSPH - Sistema de Análise de Termos de Referência"
    APP_VERSION: str = "0.1.0"

    # ------------------------------------------------------------------ #
    # CORS (Cross-Origin Resource Sharing)
    # ------------------------------------------------------------------ #
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # Lista de origens que podem chamar a API
    # O Next.js roda na porta 3000, então precisa estar aqui

    # ------------------------------------------------------------------ #
    # Upload de arquivos
    # ------------------------------------------------------------------ #
    MAX_FILE_SIZE_MB: int = 10  # limite máximo por arquivo (critério de aceitação do HU-01)
    UPLOAD_DIR: str = "uploads"  # pasta onde os arquivos ficam armazenados no servidor

    # ------------------------------------------------------------------ #
    # Propriedade calculada — não vem do .env
    # ------------------------------------------------------------------ #
    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        """Converte MB para bytes para usar na validação."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def is_mock_mode(self) -> bool:
        """Retorna True se nenhuma fonte de IA está configurada."""
        has_ollama = bool(self.OLLAMA_BASE_URL.strip())
        has_openrouter = bool(self.OPENROUTER_API_KEY.strip())
        has_openai = bool(self.OPENAI_API_KEY.strip())
        return not (has_ollama or has_openrouter or has_openai)

    @property
    def active_api_key(self) -> str:
        """Retorna a chave ativa. Ollama não precisa de chave (usa placeholder)."""
        if self.OLLAMA_BASE_URL.strip():
            return "ollama"  # Ollama não exige API key
        return self.OPENROUTER_API_KEY.strip() or self.OPENAI_API_KEY.strip()

    @property
    def active_base_url(self) -> str | None:
        """Retorna a URL base: Ollama > OpenRouter > OpenAI padrão."""
        if self.OLLAMA_BASE_URL.strip():
            return self.OLLAMA_BASE_URL.strip()
        if self.OPENROUTER_API_KEY.strip():
            return self.OPENROUTER_BASE_URL
        return None

    @property
    def active_model(self) -> str:
        """Retorna o modelo ativo: Ollama > OpenRouter > OpenAI."""
        if self.OLLAMA_BASE_URL.strip():
            return self.OLLAMA_MODEL
        if self.OPENROUTER_API_KEY.strip():
            return self.OPENROUTER_MODEL
        return self.OPENAI_MODEL

    # ------------------------------------------------------------------ #
    # Leitura do arquivo .env
    # ------------------------------------------------------------------ #
    model_config = SettingsConfigDict(
        env_file=".env",          # arquivo de variáveis de ambiente
        env_file_encoding="utf-8",
        case_sensitive=True,      # DATABASE_URL != database_url
        extra="ignore",           # variáveis extras no .env não causam erro
    )


@lru_cache
def get_settings() -> Settings:
    """
    Retorna a instância singleton das configurações.

    Por que @lru_cache?
      - O arquivo .env é lido apenas UMA vez durante o ciclo de vida da aplicação
      - Chamadas subsequentes a get_settings() retornam o mesmo objeto em cache
      - Seguro para uso com FastAPI Depends()
    """
    return Settings()


# Instância global — use `from app.core.config import settings` no código
settings = get_settings()
