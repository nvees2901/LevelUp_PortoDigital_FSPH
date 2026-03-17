# FSPH - Sistema Inteligente de Análise de Termos de Referência

Sistema de Inteligência Artificial para análise, validação e geração de Termos de Referência baseado na **Lei 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos)**.

Desenvolvido pelo Squad 02 - Porto Digital.

---

## Sobre o Projeto

O FSPH utiliza IA para auxiliar gestores públicos na elaboração e validação de Termos de Referência (TR), garantindo conformidade com a Lei 14.133/2021. O sistema identifica inconsistências, sugere melhorias e calcula o índice de conformidade legal automaticamente.

---

## Arquitetura

```
+------------------+     HTTP/REST      +------------------+
|                  |  <------------->   |                  |
|   Frontend       |                   |   Backend API    |
|   (Next.js 14)   |                   |   (FastAPI)      |
|   Port: 3000     |                   |   Port: 8000     |
+------------------+                   +------------------+
                                              |
                               +--------------+--------------+
                               |              |              |
                        +------+------+ +-----+-----+ +------+------+
                        |             | |           | |             |
                        | PostgreSQL  | |   Redis   | |  OpenAI API |
                        | (Port 5432) | | (Port 6379)| |  (External) |
                        +-------------+ +-----------+ +-------------+
```

**Stack Tecnológica:**
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, React Query
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2
- **Banco de Dados**: PostgreSQL 15
- **Cache**: Redis 7
- **IA**: OpenAI GPT-4o-mini (com fallback mock para desenvolvimento)
- **Infraestrutura**: Docker, Docker Compose

---

## Funcionalidades

### Assistente IA (Chat)
- Chat especializado em Termos de Referência e Lei 14.133/2021
- Histórico de conversa com contexto
- Respostas baseadas em conhecimento jurídico específico

### Gerenciamento de Termos de Referência
- Cadastro completo de TRs com categorias e status
- Listagem com filtros por categoria, status e busca textual
- Edição e exclusão de termos
- Visualização detalhada do conteúdo

### Análise de Conformidade Legal
- Análise automática via IA
- Identificação de inconsistências com referência legal
- Sugestões de melhoria priorizadas
- Índice de conformidade legal (0-100%)

---

## Pré-requisitos

- [Docker](https://www.docker.com/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2
- (Opcional) Node.js 20+ para desenvolvimento frontend
- (Opcional) Python 3.12+ para desenvolvimento backend
- (Opcional) Chave API OpenAI para análise real com IA

---

## Início Rápido com Docker

### 1. Clone o repositório
```bash
git clone <repo-url>
cd FSPH---Squad-02
```

### 2. Configure as variáveis de ambiente
```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Edite `backend/.env` e adicione sua chave OpenAI (opcional):
```
OPENAI_API_KEY=sk-...  # Deixe vazio para usar respostas mock
```

### 3. Inicie todos os serviços
```bash
docker compose up --build
```

### 4. Acesse o sistema
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentação da API**: http://localhost:8000/docs

---

## Desenvolvimento Local

### Backend

```bash
cd backend

# Instalar UV (gerenciador de pacotes Python)
pip install uv

# Criar ambiente virtual
uv venv && source .venv/bin/activate  # Linux/Mac
# uv venv && .venv\Scripts\activate    # Windows

# Instalar dependências
uv pip install -e ".[dev]"

# Configurar ambiente
cp .env.example .env

# Iniciar banco de dados (Docker)
docker compose -f docker-compose.dev.yml up -d postgres redis

# Executar migrações
alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Configurar ambiente
cp .env.local.example .env.local

# Iniciar servidor de desenvolvimento
npm run dev
```

---

## Variáveis de Ambiente

### Backend (`backend/.env`)

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DATABASE_URL` | URL do PostgreSQL | `postgresql+asyncpg://fsph:fsph_password@localhost:5432/fsph_db` |
| `REDIS_URL` | URL do Redis | `redis://localhost:6379/0` |
| `OPENAI_API_KEY` | Chave da API OpenAI (opcional) | vazio |
| `SECRET_KEY` | Chave secreta JWT | deve ser alterada em produção |
| `DEBUG` | Modo debug | `false` |
| `ENVIRONMENT` | Ambiente | `production` |
| `CORS_ORIGINS` | Origens permitidas (separadas por vírgula) | `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `NEXT_PUBLIC_API_URL` | URL do backend | `http://localhost:8000` |

---

## API - Visão Geral

A documentação completa está disponível em `http://localhost:8000/docs`.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v1/health` | Status da API |
| POST | `/api/v1/terms` | Criar novo TR |
| GET | `/api/v1/terms` | Listar TRs (paginado) |
| GET | `/api/v1/terms/{id}` | Buscar TR por ID |
| PUT | `/api/v1/terms/{id}` | Atualizar TR |
| DELETE | `/api/v1/terms/{id}` | Excluir TR |
| POST | `/api/v1/analysis` | Analisar TR com IA |
| GET | `/api/v1/analysis/{id}` | Buscar análise |
| GET | `/api/v1/analysis/term/{id}` | Histórico de análises do TR |
| POST | `/api/v1/chat` | Chat com assistente IA |

---

## Estrutura do Projeto

```
FSPH---Squad-02/
├── frontend/                  # Aplicação Next.js
│   └── src/
│       ├── app/               # Páginas (App Router)
│       ├── components/        # Componentes React
│       ├── hooks/             # Custom hooks
│       ├── services/          # Clientes de API
│       ├── types/             # Tipos TypeScript
│       └── lib/               # Utilitários
├── backend/                   # API FastAPI
│   └── app/
│       ├── api/routes/        # Endpoints da API
│       ├── services/          # Lógica de negócio
│       ├── models/            # Modelos SQLAlchemy
│       ├── schemas/           # Schemas Pydantic
│       ├── repositories/      # Acesso ao banco de dados
│       └── core/              # Configuração e segurança
├── infra/                     # Infraestrutura
│   ├── docker/                # Configs Docker (Postgres, Redis)
│   └── scripts/               # Scripts de setup
├── docs/                      # Documentação
├── .github/workflows/         # CI/CD (GitHub Actions)
├── docker-compose.yml         # Produção
└── docker-compose.dev.yml     # Desenvolvimento
```

---

## CI/CD

O pipeline de CI (`/.github/workflows/ci.yml`) executa automaticamente:

- **Backend**: Lint com Ruff, verificação de formatação, testes com Pytest
- **Frontend**: ESLint, verificação de tipos TypeScript, build de produção

---

## Modo Mock (Sem OpenAI)

O sistema funciona completamente sem uma chave OpenAI. Quando `OPENAI_API_KEY` não está configurada:

- O chat responde com respostas pré-definidas sobre Lei 14.133/2021
- A análise gera inconsistências e sugestões de exemplo
- A geração de TR cria um documento modelo completo

Isso permite desenvolvimento e demonstração sem custos de API.

---

## Fundamento Legal

O sistema foi desenvolvido com base na:
- **Lei nº 14.133/2021** - Nova Lei de Licitações e Contratos Administrativos
- **Instrução Normativa SEGES/ME nº 65/2021** - Pesquisa de preços
- Demais normativos aplicáveis às contratações públicas

---

## Licença

Projeto desenvolvido para o Porto Digital - Recife, PE.
