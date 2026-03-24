# Análise de Tarefas e Melhorias — Backend FSPH

> Documento gerado em 2026-03-23 | Squad 02 — Porto Digital

---

## Sumário

1. [Bugs e Inconsistências](#1-bugs-e-inconsistências)
2. [Funcionalidades Ausentes (críticas)](#2-funcionalidades-ausentes-críticas)
3. [Funcionalidades Ausentes (médio prazo)](#3-funcionalidades-ausentes-médio-prazo)
4. [Melhorias de Qualidade](#4-melhorias-de-qualidade)
5. [Infraestrutura e DevOps](#5-infraestrutura-e-devops)
6. [Priorização Sugerida (MoSCoW)](#6-priorização-sugerida-moscow)

---

## 1. Bugs e Inconsistências

### BUG-01 — Importação duplicada em `compliance.py`

**Arquivo:** `backend/app/services/compliance.py`
**Linha:** 164 (import dentro do método) e 353 (import no fim do módulo)

```python
# Linha 164 — dentro de analyze()
import unicodedata
normalized_text = cls._normalize(text)

# Linha 353 — no final do arquivo
import unicodedata  # noqa: E402 — necessário para o método estático
```

**Problema:** `unicodedata` é importado duas vezes: uma dentro do método `analyze()` (linha 164) e outra ao final do módulo (linha 353). O import do topo é desnecessário dado que o método estático `_normalize` já funciona corretamente com o import dentro de `analyze`. O correto é mover o import único para o **topo do arquivo** (antes da classe).

**Correção:**
```python
# No topo do arquivo
import unicodedata
from dataclasses import dataclass
...
# Remover import dentro de analyze() e o import no final do arquivo
```

---

### BUG-02 — `UploadResponse` class definida mas nunca usada como `response_model`

**Arquivo:** `backend/app/api/routes/upload.py`
**Linha:** 43–47 e 50

```python
class UploadResponse:
    """Resposta do upload com TR e análise embutidos."""
    def __init__(self, term: TermResponse, analysis: AnalysisResponse):
        ...

@router.post("", status_code=201)  # ← sem response_model
async def upload_document(file: UploadFile, db: DbDep):
    ...
    return {"term": term_response, "analysis": analysis_response}  # dict puro
```

**Problema:** O endpoint retorna um dict não tipado. FastAPI não valida/serializa a saída, o Swagger mostra schema genérico, e erros de serialização não são detectados em desenvolvimento.

**Correção:** Criar um schema Pydantic `UploadResponse` (ou usar um `TypedDict`) e declará-lo como `response_model`:
```python
# schemas/upload.py
class UploadResponse(BaseModel):
    term: TermResponse
    analysis: AnalysisResponse

# routes/upload.py
@router.post("", response_model=UploadResponse, status_code=201)
```

---

### BUG-03 — `GET /dashboard/stats` sem `response_model`

**Arquivo:** `backend/app/api/routes/dashboard.py`
**Linha:** 23

```python
@router.get("/stats")  # ← sem response_model
async def get_dashboard_stats(db: DbDep):
```

**Problema:** Sem `response_model`, o Swagger mostra schema como `{}` e não há validação de saída.

**Correção:** Criar `DashboardStatsResponse` schema e declarar no decorator.

---

### BUG-04 — `db.flush()` vs `db.commit()` no chat

**Arquivo:** `backend/app/api/routes/chat.py`
**Linhas:** 58, 71, 107

O `get_db` dependency precisa ser verificado — se usar `AsyncSession` sem `autocommit=True`, o `flush()` sem `commit()` pode causar perda de dados em caso de exceção pós-flush.

**Verificar:** `backend/app/core/database.py` — garantir que `AsyncSession` tem `autocommit` ou que o contexto do `get_db` faz commit ao final.

---

### BUG-05 — Arquivos físicos não são removidos ao deletar um TR

**Arquivo:** `backend/app/api/routes/terms.py`, `backend/app/repositories/term.py`

Quando um TR é deletado via `DELETE /api/v1/terms/{id}`, o arquivo físico em `uploads/` não é apagado. Ao longo do tempo isso causa acúmulo de arquivos órfãos no disco.

**Correção:** No `delete_term` route, após `TermRepository.delete()`, verificar se o TR tinha `file_path` e remover o arquivo do disco:
```python
if term.file_path and os.path.exists(term.file_path):
    os.remove(term.file_path)
```

---

## 2. Funcionalidades Ausentes (críticas)

### FEAT-01 — Migrações com Alembic

**Prioridade:** 🔴 Crítica

`alembic` está em `pyproject.toml` como dependência mas não existe nenhuma estrutura de migrations no projeto.

**Problema:** Sem Alembic, o banco precisa ser criado manualmente (`CREATE TABLE`) ou via `Base.metadata.create_all()` que é inadequado para produção (não preserva dados).

**O que fazer:**
1. Inicializar Alembic: `uv run alembic init migrations`
2. Configurar `alembic.ini` e `migrations/env.py` para usar `DATABASE_URL` do settings
3. Gerar migration inicial: `uv run alembic revision --autogenerate -m "initial"`
4. Documentar comandos no README:
   ```bash
   uv run alembic upgrade head   # aplicar migrations
   uv run alembic downgrade -1   # reverter última migration
   ```

---

### FEAT-02 — Autenticação e Autorização (JWT)

**Prioridade:** 🔴 Crítica para produção

`SECRET_KEY` está configurado mas **nenhum endpoint é protegido**. Qualquer pessoa com acesso à rede pode criar, editar ou deletar TRs.

**O que implementar:**
- `POST /api/v1/auth/login` — recebe credenciais, retorna JWT
- `POST /api/v1/auth/refresh` — renova token
- Dependency `get_current_user` via `python-jose` ou `python-jwt`
- Proteger todos os endpoints (exceto `/health`, `/`, `/api/docs`)
- Roles: `admin`, `analista`, `visualizador` (conforme personas no CONTEXT.md)

**Dependências a adicionar:**
```toml
python-jose[cryptography] = "^3.3"
passlib[bcrypt] = "^1.7"
```

---

### FEAT-03 — Testes automatizados

**Prioridade:** 🔴 Crítica para CI/CD

**Nenhum arquivo de teste existe no projeto.** O CI/CD atual faz apenas lint e build, sem testes.

**O que criar:**
```
backend/
├── tests/
│   ├── conftest.py          # fixtures: app, db, client
│   ├── test_terms.py        # CRUD de TRs
│   ├── test_upload.py       # pipeline de upload
│   ├── test_analysis.py     # análise de conformidade
│   ├── test_chat.py         # chat IA (modo mock)
│   ├── test_dashboard.py    # stats
│   └── services/
│       ├── test_compliance.py  # motor de análise
│       └── test_nlp.py         # detecção NLP
```

**Dependências a adicionar:**
```toml
pytest = "^8.0"
pytest-asyncio = "^0.23"
httpx = "^0.27"            # TestClient async
pytest-cov = "^5.0"       # cobertura
```

---

### FEAT-04 — Model `User` e sistema de autenticação

**Prioridade:** 🔴 Necessário com FEAT-02

Criar modelo `User` no banco:
```python
class User(Base):
    id: UUID
    email: str  # unique
    hashed_password: str
    full_name: str
    role: Enum  # admin | analista | visualizador
    is_active: bool
    created_at: datetime
```

---

## 3. Funcionalidades Ausentes (médio prazo)

### FEAT-05 — Cache Redis para sessões de chat

**Prioridade:** 🟡 Média

`REDIS_URL` está configurado, `redis` está nas dependências, mas **Redis não é usado em nenhum lugar do código**.

O chat atual consulta o banco a cada mensagem (para carregar a sessão), o que pode ser lento com muitas sessões simultâneas.

**O que implementar:**
- Cache de `ChatSession.messages` no Redis (TTL: 1 hora)
- Invalidar cache ao finalizar/deletar sessão
- Usar `redis.asyncio` (já instalado):
  ```python
  from redis.asyncio import Redis
  redis = Redis.from_url(settings.REDIS_URL)
  ```

---

### FEAT-06 — Endpoint `PATCH` para atualização parcial verdadeira

**Prioridade:** 🟡 Média

O endpoint `PUT /api/v1/terms/{id}` já faz atualização parcial (PATCH semântico), mas está incorretamente mapeado como `PUT`. Seguindo REST corretamente:
- `PUT` → substituição total do recurso (todos os campos obrigatórios)
- `PATCH` → atualização parcial (campos opcionais)

**Sugestão:** Adicionar `PATCH /api/v1/terms/{id}` mantendo `PUT` por compatibilidade.

---

### FEAT-07 — Expiração e limpeza de sessões de chat antigas

**Prioridade:** 🟡 Média

Sessões de chat nunca expiram automaticamente. Com o tempo, a tabela `chat_sessions` crescerá indefinidamente.

**O que implementar:**
- Campo `expires_at` no model `ChatSession`
- Job periódico (Celery ou APScheduler) para deletar sessões expiradas
- Parâmetro de TTL configurável no `.env` (ex: `CHAT_SESSION_TTL_HOURS=24`)

---

### FEAT-08 — Paginação no histórico de análises

**Arquivo:** `backend/app/api/routes/analysis.py`

`GET /api/v1/analysis/term/{term_id}` retorna **todas** as análises de um TR sem paginação. TRs com muitas re-análises podem causar resposta grande.

**Correção:** Adicionar parâmetros `page` e `limit` similar ao `GET /api/v1/terms`.

---

### FEAT-09 — Validação de conteúdo mínimo no upload

**Arquivo:** `backend/app/api/routes/upload.py`

Não há validação do comprimento mínimo do texto extraído. Um PDF corrompido ou digitalizado sem OCR pode gerar um texto vazio que passa pela pipeline sem erros.

**Correção:**
```python
if len(text.strip()) < 100:
    raise HTTPException(422, "Documento com conteúdo insuficiente para análise.")
```

---

### FEAT-10 — Rate limiting nos endpoints

**Prioridade:** 🟡 Média (especialmente para o endpoint de chat e upload)

Sem rate limiting, um usuário pode fazer flood de requests ao endpoint de chat (que chama a API da OpenRouter/OpenAI) causando custos elevados.

**Dependência a adicionar:**
```toml
slowapi = "^0.1"
```

**Endpoints críticos:**
- `POST /api/v1/chat` — limite: 30 req/min por IP
- `POST /api/v1/upload` — limite: 10 req/min por IP

---

## 4. Melhorias de Qualidade

### QUAL-01 — Schemas de resposta para o Dashboard

Criar `DashboardStatsResponse` como Pydantic schema para tipar a resposta do endpoint `GET /api/v1/dashboard/stats`.

---

### QUAL-02 — Tratamento de erro de banco de dados nas rotas

As rotas não tratam `SQLAlchemyError` explicitamente. Uma falha no banco retorna erro 500 sem mensagem descritiva. Adicionar handler global no `register_exception_handlers`.

---

### QUAL-03 — Logging estruturado com request_id

Adicionar um middleware que gera um `X-Request-ID` por requisição e o injeta em todos os logs, facilitando o rastreamento de problemas em produção.

---

### QUAL-04 — Validação de UUID nas rotas

Os parâmetros `term_id`, `analysis_id`, `session_id` aceitam qualquer `str`. Se um valor não-UUID for passado (ex: `abc`), o banco retorna erro obscuro.

**Correção:** Usar `uuid.UUID` como tipo nos parâmetros de rota:
```python
from uuid import UUID

@router.get("/{term_id}", response_model=TermResponse)
async def get_term(term_id: UUID, db: DbDep):
```

---

### QUAL-05 — Configuração de Alembic para ambientes de teste

O `database.py` cria o engine mas não há configuração para banco de teste isolado. Os testes devem usar um banco SQLite em memória ou PostgreSQL dedicado.

---

### QUAL-06 — Documentação inline das 10 critérios no OpenAPI

Os critérios de análise estão bem documentados no código mas o enum `criterio` no schema `CriterionResult` não tem descrições individuais. Adicionar `x-enum-descriptions` para melhorar a legibilidade do Swagger.

---

### QUAL-07 — Sanitização do nome do arquivo no upload

**Arquivo:** `backend/app/api/routes/upload.py`

O `filename = file.filename or "documento"` não sanitiza o nome. Nomes com caracteres especiais ou path traversal (`../etc/passwd`) devem ser neutralizados.

**Correção:**
```python
from pathlib import Path
filename = Path(file.filename or "documento").name  # remove path traversal
```

---

## 5. Infraestrutura e DevOps

### INFRA-01 — Adicionar testes ao pipeline CI/CD

**Arquivo:** `.github/workflows/ci.yml`

O CI atual executa apenas lint e build. Adicionar etapa de testes:
```yaml
- name: Run backend tests
  run: |
    uv run pytest tests/ --cov=app --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v4
```

---

### INFRA-02 — Docker Compose para desenvolvimento

Verificar se existe `docker-compose.dev.yml` ou se o `docker-compose.yml` já suporta hot-reload. Adicionar volume mount para o código do backend no container de desenvolvimento:
```yaml
volumes:
  - ./backend:/app
```

---

### INFRA-03 — Health check com status detalhado

O endpoint `GET /health` retorna apenas `{"status": "ok"}`. Melhorar para incluir:
- Status da conexão com PostgreSQL
- Status da conexão com Redis
- Status do ChromaDB/RAG
- Versão atual do schema do banco (alembic head)

---

### INFRA-04 — Variáveis de ambiente obrigatórias

`SECRET_KEY` tem valor padrão inseguro. Em `ENVIRONMENT=production`, a aplicação deve **falhar no startup** se `SECRET_KEY` for o valor padrão.

```python
@model_validator(mode="after")
def validate_production_settings(self):
    if self.ENVIRONMENT == "production":
        if self.SECRET_KEY == "change-me-in-production...":
            raise ValueError("SECRET_KEY deve ser alterado em produção")
    return self
```

---

## 6. Priorização Sugerida (MoSCoW)

### Must Have (Sprint atual / próxima)

| ID | Tarefa | Esforço |
|----|--------|---------|
| BUG-01 | Corrigir import duplicado em `compliance.py` | 15 min |
| BUG-02 | Adicionar `response_model` no upload | 30 min |
| BUG-03 | Adicionar `response_model` no dashboard | 30 min |
| BUG-05 | Limpar arquivos físicos ao deletar TR | 1h |
| FEAT-01 | Implementar migrações Alembic | 3h |
| FEAT-03 | Criar estrutura básica de testes (pytest + conftest) | 4h |
| QUAL-04 | Validação de UUID nos path params | 30 min |
| QUAL-07 | Sanitizar nome de arquivo no upload | 30 min |

### Should Have (próximas 2 sprints)

| ID | Tarefa | Esforço |
|----|--------|---------|
| FEAT-02 | Autenticação JWT (login + middleware) | 1 semana |
| FEAT-04 | Model User + migrations | 1 dia |
| FEAT-09 | Validar conteúdo mínimo no upload | 1h |
| QUAL-01 | Schema `DashboardStatsResponse` | 1h |
| QUAL-02 | Handler global para `SQLAlchemyError` | 2h |
| INFRA-01 | Testes no CI/CD | 2h |
| INFRA-04 | Validar `SECRET_KEY` em produção | 1h |

### Could Have (backlog)

| ID | Tarefa | Esforço |
|----|--------|---------|
| FEAT-05 | Cache Redis para sessões de chat | 3h |
| FEAT-07 | Expiração automática de sessões | 4h |
| FEAT-08 | Paginação no histórico de análises | 1h |
| FEAT-10 | Rate limiting com `slowapi` | 2h |
| QUAL-03 | Request ID no logging | 2h |
| INFRA-02 | Docker Compose dev com hot-reload | 2h |
| INFRA-03 | Health check detalhado (DB + Redis + RAG) | 2h |

### Won't Have (agora)

| ID | Tarefa | Observação |
|----|--------|------------|
| FEAT-06 | Endpoint PATCH semântico | PUT atual já funciona como PATCH |

---

## Referências

- [FastAPI Best Practices](https://fastapi.tiangolo.com/tutorial/)
- [Alembic Docs](https://alembic.sqlalchemy.org/)
- [SQLAlchemy Async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [Lei 14.133/2021](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm)
