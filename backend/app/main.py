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

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import admin, analysis, auth, chat, dashboard, terms, upload, workflow
from app.core.config import settings
from app.core.database import engine
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import get_logger, setup_logging

# ------------------------------------------------------------------ #
# Configuração de logging — deve ser a PRIMEIRA coisa a executar
# ------------------------------------------------------------------ #
setup_logging()
logger = get_logger(__name__)


# ------------------------------------------------------------------ #
# Middleware catch-all — garante headers CORS em respostas 500
# ------------------------------------------------------------------ #
# O handler global de Exception registrado via add_exception_handler()
# é processado pelo ServerErrorMiddleware, que fica ACIMA (mais externo)
# do CORSMiddleware na pilha. Isso faz com que respostas 500 geradas por
# exceções não previstas saiam sem os headers Access-Control-Allow-*.
#
# Solução: middleware ASGI puro que captura a exceção DENTRO da pilha,
# antes que a resposta chegue ao CORSMiddleware (que fica mais externo).
# A ordem de add_middleware (LIFO para "mais externo"):
#   1. CatchAllMiddleware (primeiro) → fica mais INTERNO
#   2. CORSMiddleware (último)       → fica mais EXTERNO
# Fluxo: req → CORSMiddleware → CatchAllMiddleware → rotas
#          res ← CORSMiddleware (adiciona ACAO) ← CatchAllMiddleware(500)
#
# Por que ASGI puro e não BaseHTTPMiddleware?
#   BaseHTTPMiddleware acumula o corpo inteiro antes de repassar, o que
#   quebra endpoints SSE (chat streaming). O ASGI middleware delega
#   diretamente ao app interno sem buffering — streaming funciona normalmente.

class CatchAllMiddleware:
    """
    Middleware ASGI puro que captura qualquer Exception não tratada e
    retorna JSON 500 padronizado. Por estar mais interno que o
    CORSMiddleware, a resposta 500 ainda atravessa o CORS que adiciona
    Access-Control-Allow-Origin. Não interfere com respostas streaming
    (SSE/PDF) pois não faz buffering do corpo.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except Exception:
            logger.error("Erro não tratado (catch-all middleware)", exc_info=True)
            response = JSONResponse(
                status_code=500,
                content={
                    "error": "INTERNAL_SERVER_ERROR",
                    "message": "Ocorreu um erro interno. Por favor, tente novamente.",
                },
            )
            await response(scope, receive, send)


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
        "Iniciando %s v%s | Ambiente: %s | IA configurada: %s",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT,
        not settings.is_mock_mode,
    )

    # Verifica a conexão com o banco ao iniciar
    # (não cria tabelas — isso é responsabilidade do Alembic)
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✓ Conexão com PostgreSQL estabelecida")
    except Exception as e:
        logger.warning(
            "⚠ PostgreSQL não disponível: %s — "
            "endpoints que usam banco retornarão erro até a conexão ser restaurada.",
            str(e),
        )

    # Bootstrap do admin em dev (evita 401 no primeiro boot)
    if settings.ENVIRONMENT != "production":
        try:
            from app.core.database import AsyncSessionLocal
            from app.repositories.user import UserRepository
            from app.services.auth import hash_password

            async with AsyncSessionLocal() as admin_db:
                existing = await UserRepository.get_by_matricula(admin_db, "ADMIN-001")
                if existing is None:
                    await UserRepository.create(admin_db, {
                        "matricula": "ADMIN-001",
                        "nome": "Administrador FSPH",
                        "senha_hash": hash_password("senha123"),
                        "setor_id": "colic",
                        "subunidade": None,
                        "is_admin": True,
                        "ativo": True,
                    })
                    await admin_db.commit()
                    logger.info("✓ Admin dev criado: ADMIN-001 / senha123")
                else:
                    logger.info("✓ Admin dev já existe: ADMIN-001")
        except Exception as e:
            logger.warning("Bootstrap admin falhou (banco pode estar indisponível): %s", e)

    # RAG (ChromaDB server via Docker) — indexação em background no startup
    if settings.RAG_ENABLED:
        logger.info(
            "RAG habilitado — ChromaDB em %s:%s",
            settings.CHROMA_HOST, settings.CHROMA_PORT,
        )
        # Indexa documentos em background para não bloquear o startup
        import asyncio

        async def _index_in_background() -> None:
            try:
                from app.core.database import AsyncSessionLocal
                from app.services.rag_service import RagService
                await asyncio.to_thread(RagService.setup)
                await asyncio.to_thread(RagService.index_documents)
                async with AsyncSessionLocal() as seed_db:
                    await RagService.import_seed_documents(seed_db)
                logger.info("✓ RAG: inicialização em background concluída")
            except Exception as e:
                logger.warning("RAG: inicialização em background falhou (será tentada na primeira busca): %s", e)

        asyncio.create_task(_index_in_background())
    else:
        logger.info("RAG desabilitado (RAG_ENABLED=false) — chat funcionará sem contexto vetorial")

    yield  # ← aplicação está rodando aqui

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
# Middleware stack — ordem importa (add_middleware é LIFO para "externo")
# ------------------------------------------------------------------ #
_cors_origins = list(settings.CORS_ORIGINS)
for _o in [
    "https://fsph-colic.web.app",
    "https://fsph-colic.firebaseapp.com",
    "http://localhost:5173",
    "http://localhost:3000",
]:
    if _o not in _cors_origins:
        _cors_origins.append(_o)

# 1. Inner: captura Exception antes que a resposta chegue ao CORS
app.add_middleware(CatchAllMiddleware)

# 2. Outer: adiciona headers Access-Control-Allow-* em toda resposta
#    (incluindo a JSONResponse 500 gerada pelo CatchAllMiddleware acima)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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

app.include_router(auth.router,      prefix=API_V1_PREFIX)  # POST /auth/login, GET /auth/me
app.include_router(workflow.router,  prefix=API_V1_PREFIX)  # BEFORE terms — /terms/pendentes (static) must resolve before /terms/{id}
app.include_router(terms.router,     prefix=API_V1_PREFIX)
app.include_router(upload.router,    prefix=API_V1_PREFIX)
app.include_router(analysis.router,  prefix=API_V1_PREFIX)
app.include_router(chat.router,      prefix=API_V1_PREFIX)
app.include_router(dashboard.router, prefix=API_V1_PREFIX)
app.include_router(admin.router,     prefix=API_V1_PREFIX)  # POST/GET/DELETE /admin/context-documents


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
        "ai_configured": not settings.is_mock_mode,
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
