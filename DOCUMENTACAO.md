<img width="1063" alt="FSPH" src="https://github.com/user-attachments/assets/ff31e88d-ff03-4401-9e81-8ca9f0cf0058" />

# FSPH — Documentação do Projeto

Sistema inteligente de **análise, geração e validação de Termos de Referência (TR)** com base na **Lei nº 14.133/2021**, para a Fundação de Saúde Parreiras Horta (FSPH) / Governo de Sergipe.

> Desenvolvido pelo **Squad 02 — Porto Digital**.

---

## 1. Visão geral

A plataforma permite ao gestor **descrever uma contratação em linguagem natural** (Chat IA) e obter um **Termo de Referência completo e estruturado** (Art. 6º, XXIII), exportável em **PDF** e **DOCX** no padrão documental de governo. Um **avaliador de conformidade** sinaliza o quanto o TR atende aos critérios legais, e a IA pode ser enriquecida por uma **base de conhecimento** mantida pelo administrador.

Principais capacidades:
- **Geração de TR via chat** (síntese a partir da conversa — não copia as perguntas).
- **Exportação PDF/DOCX** formal, com assinatura (responsável = criador; autoridade competente informada na geração).
- **Conformidade (IA)** com a Lei 14.133 + base de TRs da FSPH (score + selo).
- **Base de conhecimento** (categorias **Prompt** e **TR**) gerenciada pelo admin.
- **IA com fallback automático** entre provedores (OpenRouter → Ollama → OpenAI).

---

## 2. Arquitetura e stack

```
+------------------+      HTTP/REST       +------------------+
|   Frontend       |  <--------------->   |   Backend API    |
|  (React + Vite)  |                      |    (FastAPI)     |
|   :5173          |                      |    :8000         |
+------------------+                      +--------+---------+
                                                   |
                        +--------------------------+--------------------------+
                        |                          |                          |
                 +------+------+           +-------+-------+          +--------+--------+
                 | PostgreSQL  |           |   Provedor IA |          |  ChromaDB (RAG) |
                 |  :5432      |           | OpenRouter /  |          |  (opcional)     |
                 |             |           | Ollama / OpenAI|         |                 |
                 +-------------+           +---------------+          +-----------------+
```

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS (design system próprio), lucide-react.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, Alembic.
- **Banco:** PostgreSQL 15/16.
- **IA:** provedores OpenAI-compatible — **OpenRouter**, **Ollama** (local) e **OpenAI**, com fallback automático; **Gemini** suportado via SDK próprio.
- **Documentos:** ReportLab (PDF), python-docx (DOCX), pdfplumber/pypdf/python-docx (extração).
- **RAG (opcional):** ChromaDB (busca semântica).

---

## 3. Estrutura do repositório

```
backend/
  app/
    api/routes/      auth, terms, analysis, chat, dashboard, upload, admin, workflow
    services/        ai_chat, chat_orchestrator, compliance, pdf_generator,
                     docx_generator, rag_service, nlp, document, ...
    models/          user, term, analysis, chat_session, context_document, ...
    repositories/    acesso a dados
    core/            config, database, security
  alembic/versions/  migrações 001..009
  scripts/seed_users.py
  documents/         Lei 14.133 + TRs aprovados (modelos)
frontend/
  src/
    components/      Auth, Layout, Dashboard, Terms, Chat, Upload, Admin
    contexts/        AuthContext
    services/        api.ts
    index.css        design system (.card/.btn/.input/.badge/...)
docker-compose.yml   Makefile   DOCUMENTACAO.md
```

---

## 4. Como rodar

### 4.1. Com Docker (recomendado para o stack completo)

```bash
cp backend/.env.example backend/.env   # ajuste se necessário
docker compose up --build
```
- App: http://localhost:5173 (ou a porta do Vite) · API: http://localhost:8000 · Docs: http://localhost:8000/api/docs

### 4.2. Local, sem Docker (passo a passo usado em dev)

**PostgreSQL** (via Homebrew):
```bash
brew install postgresql@16 && brew services start postgresql@16
createuser -s postgres && psql -d postgres -c "ALTER USER postgres PASSWORD 'postgres';"
createdb -O postgres fsph
```

**Backend**:
```bash
cd backend
uv sync --python 3.12
uv run alembic upgrade head           # cria as tabelas
uv run python -m scripts.seed_users   # base fictícia de usuários
uv run dev                            # API em :8000
```

**IA local (Ollama)** — opcional, mas recomendado offline:
```bash
brew install ollama && brew services start ollama
ollama pull qwen2.5:3b
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev                           # app em :5173
```

---

## 5. Variáveis de ambiente (`backend/.env`)

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | PostgreSQL (asyncpg) | `postgresql+asyncpg://postgres:postgres@localhost:5432/fsph` |
| `OLLAMA_BASE_URL` | Endpoint do Ollama (vazio = desligado) | `http://localhost:11434/v1` |
| `OLLAMA_MODEL` | Modelo Ollama | `qwen2.5:3b` |
| `OPENROUTER_API_KEY` | Chave OpenRouter | vazio |
| `OPENROUTER_MODEL` | Modelo OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Chave/modelo OpenAI | vazio / `gpt-4o-mini` |
| `AI_TIMEOUT_SECONDS` | Timeout das chamadas de IA | `180` |
| `RAG_ENABLED` | Liga a busca semântica (ChromaDB) | `false` |
| `CHROMA_HOST` / `CHROMA_PORT` | ChromaDB | `localhost` / `8100` |
| `DOCS_PATH` | Pasta com Lei + TRs modelo | `documents/` |
| `SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` | Segurança/JWT | — |

> `backend/.env` **não deve ser versionado** com segredos reais (DB/chaves) — é configuração local.

---

## 6. Provedores de IA e fallback

A IA usa provedores **OpenAI-compatible** numa cadeia com **fallback automático**:

```
OpenRouter  →  Ollama  →  OpenAI
```

Em **rate-limit (429)**, **indisponibilidade (5xx)** ou **timeout**, a chamada cai para o próximo provedor sem erro ao usuário. Assim, usa-se a melhor qualidade disponível (ex.: Llama 3.3 70B no OpenRouter) e, quando saturado, o **Ollama local** garante continuidade. (Gemini, se configurado, usa SDK próprio.)

---

## 7. Funcionalidades

### 7.1. Geração de TR (Chat IA)
- Modo **Gerar TR**: o gestor descreve a contratação; ao clicar **"Gerar TR"** (`POST /chat/{id}/finalize`), o backend **sintetiza** o TR final a partir de toda a conversa (ignora perguntas/saudações), usando um **TR aprovado da FSPH** como modelo de estrutura.
- A IA é **adaptável**: ajusta papel/tom/formato ao pedido.

### 7.2. Conformidade (IA)
- `POST /analysis` avalia o TR contra **10 critérios** do Art. 6º, XXIII (objeto, justificativa, valor estimado, critério de julgamento, prazo, local, modalidade, sustentabilidade, garantia, obrigações).
- Resultado: **score 0–100** + status (**aprovado ≥ 80 / alerta 50–79 / reprovado < 50**) + sugestões.
- No detalhe do processo: selo **Em conformidade / Atenção / Não conforme** e botão **"Ajustar no Chat IA"** quando há pendências.
- *Calibração:* as palavras-chave de cada critério são **alternativas** (sinônimos) — o critério é atendido ao usar a terminologia pertinente, sem exigir todos os sinônimos.

### 7.3. Exportação PDF / DOCX
- `GET /terms/{id}/export/pdf` e `/export/docx` geram o documento formal (cabeçalho institucional, seções numeradas com base legal, **letras pretas**, fonte única).
- **Assinatura:** "Responsável pela elaboração" = **quem criou** o TR; "Autoridade competente" = informada na geração via params `autoridade` / `autoridade_cargo` (o frontend pergunta num modal antes de gerar).

### 7.4. Base de conhecimento (Admin)
Tela **"Base de Conhecimento IA"** (somente admin). O administrador adiciona contexto **pela própria interface — sem tocar no banco**:
- **Enviar arquivos:** arrasta/solta ou seleciona PDF/DOCX/DOC.
- **Adicionar texto:** cola o conteúdo diretamente.
- **Categoria de destino:** **Prompt** (instruções/contexto da IA) ou **TR** (modelos de termo).
- A lista mostra status (Indexado/Pendente/Falhou), permite ativar/desativar, reindexar, baixar e excluir.

> Para a IA **consumir** esses documentos nas respostas, o **RAG precisa estar ligado** (`RAG_ENABLED=true` + ChromaDB, via Docker). Com RAG desligado, os documentos são armazenados mas não entram no contexto; a geração usa o TR-modelo de `documents/`.

### 7.5. Perfil do usuário
- Topo direito: **nome + setor + matrícula** do usuário logado.

---

## 8. Fluxo de uso (passo a passo)

1. **Login** (matrícula + senha).
2. **Chat IA → Gerar TR**: descreva o objeto, valor, prazo, local, modalidade etc.
3. Clique **"Gerar TR"** → o processo aparece em **Processos**.
4. Abra o processo → **PDF** ou **DOCX** (informe a autoridade no modal) → documento formal pronto.
5. **Solicitar Análise IA** → veja o selo de conformidade; se houver pendências, use **"Ajustar no Chat IA"**.

---

## 9. API — principais endpoints

Base: `/api/v1` · Auth: `Bearer <token>` · Docs interativas: `/api/docs`

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/auth/login` | Login (matrícula + senha) → JWT |
| GET | `/auth/me` | Usuário logado |
| GET/POST | `/terms` | Listar / criar TR |
| GET/PUT/DELETE | `/terms/{id}` | Detalhe / atualizar / remover |
| GET | `/terms/{id}/export/pdf` | Exporta PDF (`?autoridade=&autoridade_cargo=`) |
| GET | `/terms/{id}/export/docx` | Exporta DOCX (mesmos params) |
| POST | `/chat` | Mensagem ao chat (modos: gerar/analisar/consultar) |
| POST | `/chat/{id}/finalize` | Sintetiza o TR final da conversa |
| GET/DELETE | `/chat/{id}` | Histórico / encerrar sessão |
| POST | `/analysis` | Analisa conformidade de um TR |
| GET | `/analysis/term/{id}` | Histórico de análises |
| GET | `/dashboard/stats` | Métricas do painel |
| POST | `/admin/context-documents` | Upload de documento de contexto (admin) |
| POST | `/admin/context-documents/text` | Adiciona texto de contexto (admin) |
| GET | `/admin/knowledge-base/collections` | Estatísticas das coleções |

---

## 10. Banco de dados

**Tabelas (models):** `users`, `terms`, `analyses`, `chat_sessions`, `context_documents`, `term_checklists`, `workflow_events`.

**Migrações (Alembic):** `001`..`009`. Destaques:
- `008` — adiciona `collection`/`is_seed` em `context_documents`.
- `009` — colapsa as categorias para **`prompt`** e **`tr`**.

Aplicar: `uv run alembic upgrade head`.

---

## 11. Usuários de teste (seed)

`uv run python -m scripts.seed_users` cria a base fictícia (senha de todos: **`senha123`**):

| Matrícula | Nome | Setor |
|---|---|---|
| `1001`–`1004` | Demandantes (HEMOSE, LACEN, SVO, Adm) | demandante |
| `2001` | Fernanda Almeida Costa | DIROP |
| `2002` | Ricardo Mendes Barbosa | DIRAF |
| `2003` | Patrícia Gomes Ferreira | DIGER |
| `2004` | Bruno Carvalho Rocha | COLIC |
| `2005` | Juliana Ribeiro Martins | Jurídico |
| `ADMIN-001` | Roberto Dias Nogueira | COLIC (**admin**) |

---

## 12. Notas e limitações

- A **qualidade do conteúdo** depende do provedor de IA. Localmente, o `qwen2.5:3b` é rápido mas simples; provedores em nuvem (OpenRouter/OpenAI) produzem TRs mais completos.
- O **RAG/ChromaDB** é opcional (Docker). Sem ele, a base de conhecimento do admin não entra no contexto da IA.
- O **fluxo de aprovação** por setores (tramitação) existe no backend, mas foi **removido da UI** por estar fora do escopo do MVP.
- **Fundamento legal:** Lei nº 14.133/2021 e Instrução Normativa SEGES/ME nº 65/2021.

---
*Projeto desenvolvido para a Entrega LevelUp — Porto Digital.*
