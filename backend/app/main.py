"""
main.py — Entrypoint da aplicação FastAPI

Este é o arquivo que o servidor (Uvicorn) carrega para iniciar a API.
Responsabilidades:
  1. Criar a instância FastAPI com metadados (docs, versão)
  2. Configurar CORS (quais frontends podem chamar a API)
  3. Registrar handlers de exceção customizados
  4. Registrar todos os routers (prefixo /api/v1)
  5. Gerenciar o ciclo de vida (startup/shutdown da conexão com o banco)
  6. Expor endpoint de health check

Como rodar:
  uv run uvicorn app.main:app --reload --port 8000
  Ou com o script definido em pyproject.toml:
  uv run dev
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, chat, dashboard, terms, upload
from app.core.config import settings
from app.core.database import engine
from app.services.rag_service import RagService
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import get_logger, setup_logging

# ------------------------------------------------------------------ #
# Configuração de logging — deve ser a PRIMEIRA coisa a executar
# ------------------------------------------------------------------ #
setup_logging()
logger = get_logger(__name__)


# ------------------------------------------------------------------ #
# Lifecycle da aplicação
# ------------------------------------------------------------------ #

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gerencia o ciclo de vida da aplicação.

    Executado:
      - startup:  quando o servidor inicia (yield antes)
      - shutdown: quando o servidor é encerrado (yield depois)

    Por que usar lifespan em vez de @app.on_event("startup")?
      O on_event está depreciado no FastAPI >= 0.93. O lifespan é a
      forma moderna e recomendada, usando context manager async.
    """
    # ---- STARTUP ----
    logger.info(
        "Iniciando %s v%s | Ambiente: %s | Modo mock: %s",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT,
        settings.is_mock_mode,
    )

    # Verifica a conexão com o banco ao iniciar
    # (não cria tabelas — isso é responsabilidade do Alembic)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: c.execute(c.dialect.do_ping(c)))
        logger.info("✓ Conexão com PostgreSQL estabelecida")
    except Exception as e:
        logger.warning(
            "⚠ PostgreSQL não disponível: %s — "
            "endpoints que usam banco retornarão erro até a conexão ser restaurada.",
            str(e),
        )

    # Inicializa o ChromaDB e modelo de embedding de forma síncrona (rápido ~5s)
    # A indexação dos documentos é disparada em background para não bloquear o startup
    try:
        logger.info("Inicializando RAG (ChromaDB + embeddings)...")
        await asyncio.to_thread(RagService.setup)
        logger.info("✓ RAG pronto — indexação de documentos iniciada em background")
    except Exception as e:
        logger.warning("⚠ RAG não inicializado: %s — chat e análise funcionarão sem contexto vetorial.", str(e))

    # Dispara a indexação em background (não bloqueia o startup)
    indexing_task = asyncio.create_task(
        asyncio.to_thread(RagService.index_documents)
    )

    yield  # ← aplicação está rodando aqui

    # Aguarda indexação terminar antes de encerrar (se ainda estiver rodando)
    if not indexing_task.done():
        logger.info("Aguardando indexação em background finalizar...")
        await indexing_task

    # ---- SHUTDOWN ----
    logger.info("Encerrando aplicação, fechando pool de conexões...")
    await engine.dispose()
    logger.info("✓ Pool de conexões fechado com sucesso")


# ------------------------------------------------------------------ #
# Instância FastAPI
# ------------------------------------------------------------------ #

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## API do Sistema de Análise de Termos de Referência — FSPH

Plataforma com IA que centraliza termos, valida automaticamente contra
a **Lei 14.133/2021** e gera novos TRs via chat inteligente.

### Funcionalidades principais:
- 📄 **Upload** de documentos PDF/DOCX com análise automática
- ✅ **Validação** contra 10 critérios da Lei 14.133/2021
- 🤖 **Chat IA** em 3 modos: gerar, analisar, consultar
- 📊 **Dashboard** com estatísticas de conformidade
- 📥 **Exportação** de TRs em PDF formatado

### Modo Mock:
Se `OPENAI_API_KEY` não estiver configurada, todas as respostas de IA
usam dados simulados — sem custo e sem necessidade de conta OpenAI.
    """,
    docs_url="/api/docs",         # Swagger UI
    redoc_url="/api/redoc",       # ReDoc
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


# ------------------------------------------------------------------ #
# CORS — Cross-Origin Resource Sharing
# ------------------------------------------------------------------ #
# Permite que o frontend Next.js (porta 3000) chame esta API
# Em produção, substitua por origens específicas no .env

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, DELETE, OPTIONS...
    allow_headers=["*"],          # Content-Type, Authorization...
)


# ------------------------------------------------------------------ #
# Handlers de exceção
# ------------------------------------------------------------------ #
register_exception_handlers(app)


# ------------------------------------------------------------------ #
# Routers — agrupa endpoints por domínio
# ------------------------------------------------------------------ #
# Prefixo /api/v1 → versionamento da API
# Se no futuro surgir uma v2, podemos adicionar o novo router sem quebrar clientes v1

API_V1_PREFIX = "/api/v1"

app.include_router(terms.router,     prefix=API_V1_PREFIX)
app.include_router(upload.router,    prefix=API_V1_PREFIX)
app.include_router(analysis.router,  prefix=API_V1_PREFIX)
app.include_router(chat.router,      prefix=API_V1_PREFIX)
app.include_router(dashboard.router, prefix=API_V1_PREFIX)


# ------------------------------------------------------------------ #
# Endpoints utilitários (sem prefixo v1 — são infraestrutura)
# ------------------------------------------------------------------ #

@app.get("/health", tags=["Infraestrutura"])
async def health_check():
    """
    Health check da aplicação.

    Retorna status geral e modo de operação.
    Usado por Docker healthcheck, load balancers e monitoramento.

    GET /health → { "status": "ok", "version": "0.1.0", "mock_mode": true }
    """
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "mock_mode": settings.is_mock_mode,
    }


@app.get("/", tags=["Infraestrutura"])
async def root():
    """Redireciona para a documentação interativa."""
    return {
        "message": f"Bem-vindo ao {settings.APP_NAME}",
        "docs": "/api/docs",
        "health": "/health",
        "version": settings.APP_VERSION,
    }
