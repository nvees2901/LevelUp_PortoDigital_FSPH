<img width="1063" height="234" alt="logo-fsph" src="https://github.com/user-attachments/assets/ff31e88d-ff03-4401-9e81-8ca9f0cf0058" />

# FSPH - Sistema Inteligente de Análise de Termos de Referência

Sistema de Inteligência Artificial para análise, validação e geração de Termos de Referência baseado na **Lei 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos)**.

Desenvolvido pelo **Squad 02 - Porto Digital**.

---

## 1. Sobre o Projeto (O Problema e a Solução)

**O Problema:** A Fundação de Saúde Parreiras Horta (FSPH) elabora Termos de Referência manualmente, sem reaproveitamento de modelos, sem validação automática contra a Lei 14.133/2021 e com base de documentos dispersa em formatos heterogêneos (.doc/.docx/.pdf), gerando retrabalho e risco de não conformidade.

**A Solução:** Plataforma web com IA que centraliza os termos, valida automaticamente contra 10 critérios da Lei 14.133, gera novos termos via chat inteligente guiado, extrai dados de PDF/DOC/DOCX por NLP e exporta documentos em PDF formatado. A interface segue a **identidade visual oficial** da FSPH e do Governo de Sergipe.

---

##  2. Personas Identificadas

| Persona | Perfil | Necessidade | Dor Principal |
|---------|--------|-------------|---------------|
| **Douglas** | Gestor Adm. | Gerar termos rapidamente com segurança jurídica, reaproveitando modelos. | Gasta dias redigindo termos do zero, sem saber se estão completos. |
| **Ana** | Assessora Jurídica | Verificar a conformidade com a Lei 14.133 de forma rápida, confiável e artigo por artigo. | Revisão manual e demorada, sujeita a erros humanos, sem checklist. |
| **Carlos** | Diretor | Dashboard com status dos termos, métricas de conformidade e acompanhamento. | Não tem visibilidade do andamento, qualidade e volume de termos. |

---

## 3. Jornadas do Usuário e Fluxo de Trabalho

### Fluxo de Aprovação Institucional
O sistema conta com logins separados por setor, obedecendo o seguinte pipeline de validação:
`Área Demandante` ➔ `Diretoria` ➔ `Contratos` ➔ `Controle Interno` ➔ `Jurídico` ➔ `Financeiro` ➔ `Contratos (Final)`.

### Jornada 1: Gerar Novo Termo via IA
1. Usuário acessa "Chat IA" e descreve o objeto da contratação.
2. IA solicita variáveis (valor estimado, prazo, tipo de licitação).
3. IA estrutura as 7 seções obrigatórias (Art. 6º, XXIII) e cita os artigos.
4. Usuário revisa e o termo entra no fluxo de rascunho.

### Jornada 2: Analisar Termo Existente (Upload)
1. Faz upload de PDF ou DOCX (Motor extrai texto por NLP).
2. IA valida contra os critérios da Lei 14.133.
3. Sistema exibe "Score de Conformidade" e painel de alertas visuais (Aprovado/Reprovado/Atenção).

---

##  4. Arquitetura e Stack Tecnológica

```text
+------------------+      HTTP/REST      +------------------+
|                  |  <------------->    |                  |
|    Frontend      |                     |   Backend API    |
|  (React / Vite)  |                     |    (FastAPI)     |
|    Port: 5173    |                     |    Port: 8000    |
+------------------+                     +------------------+
                                              |
                               +--------------+--------------+
                               |              |              |
                        +------+------+ +-----+-----+ +------+------+
                        |             | |           | |             |
                        | PostgreSQL  | |   Redis   | |  OpenAI API |
                        | (Port 5432) | |(Port 6379)| |  (External) |
                        +-------------+ +-----------+ +-------------+
```

**Stack Tecnológica:**
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide-React (Ícones).
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2.
- **Banco de Dados & Cache**: PostgreSQL 15, Redis 7.
- **IA**: OpenAI GPT-4o-mini (com fallback mock no frontend para desenvolvimento).
- **Infraestrutura**: Docker, Docker Compose.

---

##  5. Início Rápido com Docker

### 1. Clone o repositório
```bash
git clone [https://github.com/nvees2901/FSPH---Squad-02.git](https://github.com/nvees2901/FSPH---Squad-02.git)
cd FSPH---Squad-02
```

### 2. Configure as variáveis de ambiente
```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```
*(Opcional: Edite `backend/.env` e adicione sua chave `OPENAI_API_KEY`. Deixe vazio para usar respostas mock).*

### 3. Inicie todos os serviços
```bash
docker compose up --build
```

### 4. Acesse o sistema
- **Frontend**: http://localhost:5173 *(ou a porta definida pelo Vite)*
- **Backend API**: http://localhost:8000
- **Documentação da API**: http://localhost:8000/docs

---

##  6. Desenvolvimento Local

### Frontend (React/Vite)
```bash
cd frontend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

### Backend (FastAPI)
```bash
cd backend

# Instalar UV (gerenciador de pacotes Python)
pip install uv

# Criar ambiente virtual e ativar
uv venv && source .venv/bin/activate  # Linux/Mac

# Instalar dependências
uv pip install -e ".[dev]"

# Iniciar banco de dados (Docker)
docker compose -f docker-compose.dev.yml up -d postgres redis

# Executar migrações
alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload --port 8000
```

---

## 7. Variáveis de Ambiente

### Frontend (`frontend/.env.local`)
| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `VITE_API_URL` | URL do backend | `http://localhost:8000` |

### Backend (`backend/.env`)
| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DATABASE_URL` | URL do PostgreSQL | `postgresql+asyncpg://fsph:fsph_password@localhost:5432/fsph_db` |
| `REDIS_URL` | URL do Redis | `redis://localhost:6379/0` |
| `OPENAI_API_KEY` | Chave da API OpenAI | vazio (usa mocks) |

---

## 8. API - Visão Geral

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v1/health` | Status da API |
| POST | `/api/v1/terms` | Criar novo TR |
| GET | `/api/v1/terms` | Listar TRs (paginado) |
| POST | `/api/v1/analysis` | Analisar TR com IA |
| POST | `/api/v1/chat` | Chat com assistente IA |

*(Documentação completa disponível via Swagger em `/docs` no ambiente local).*

---

##  9. Modo Mock (Sem OpenAI)

O sistema foi arquitetado para funcionar localmente **sem uma chave da OpenAI**. Quando a variável não está configurada, o sistema aciona um "Mock Mode":
- O chat retorna fluxos pré-programados de criação de TRs.
- O motor de NLP simula a extração e validação de documentos com scores fictícios para viabilizar testes de UI/UX e de banco de dados sem custos.

---

##  10. Fundamento Legal

O sistema foi desenvolvido estritamente com base na:
- **Lei nº 14.133/2021** - Nova Lei de Licitações e Contratos Administrativos.
- **Instrução Normativa SEGES/ME nº 65/2021** - Pesquisa de preços.

---
*Projeto desenvolvido para a Entrega Parcial LevelUp.*
