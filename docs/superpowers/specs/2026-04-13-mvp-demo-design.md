# MVP Demo FSPH — Spec de Implementacao

**Data:** 2026-04-13
**Objetivo:** Tornar a aplicacao FSPH minimamente funcional para demonstracao ao vivo hoje.
**Fluxos cobertos:** Chat com IA (Gemini) + Upload com analise de conformidade + Dashboard com metricas

---

## 1. Integracao Gemini no Backend

### Contexto
O `.env` possui `GEMINI_API_KEY` e `GEMINI_MODEL=gemini-2.0-flash`, porem o `ai_chat.py` so suporta Ollama/OpenRouter/OpenAI. O Gemini deve ser adicionado como provider prioritario.

### Mudancas

**`backend/pyproject.toml`**
- Adicionar dependencia `google-genai>=1.0.0`

**`backend/app/core/config.py`**
- Adicionar campos `GEMINI_API_KEY: str = ""` e `GEMINI_MODEL: str = "gemini-2.0-flash"` na classe Settings

**`backend/app/services/ai_chat.py`**
- Adicionar metodo `_generate_gemini()` que usa `google.genai` para gerar respostas
- Adicionar metodo `_stream_gemini()` para streaming via async generator
- Alterar `__init__` para priorizar Gemini na cadeia de fallback:
  - Gemini (se `GEMINI_API_KEY` presente) → Ollama → OpenRouter → OpenAI → Mock
- System prompt deve instruir a IA sobre o contexto FSPH e Lei 14.133/2021
- Os 3 modos de chat (gerar, analisar, consultar) devem funcionar com Gemini

### Criterios de aceite
- Chat retorna respostas reais do Gemini 2.0 Flash
- Streaming funciona (tokens aparecem incrementalmente no frontend)
- Se Gemini falhar, cai para mock mode sem erro visivel ao usuario

---

## 2. Infraestrutura (Docker + PostgreSQL + Migrations)

### Contexto
O backend depende de PostgreSQL para persistir termos, analises e sessoes de chat. O `docker-compose.yml` ja define o servico `postgres` na porta 5433.

### Mudancas

**Nenhuma mudanca de codigo** — apenas operacional:
1. `docker compose up -d postgres` para subir o banco
2. `cd backend && uv sync` para instalar dependencias (incluindo nova dep do Gemini)
3. `uv run alembic upgrade head` para aplicar migration `001_create_initial_tables`
4. `uv run dev` para iniciar o backend

### Criterios de aceite
- `GET /health` retorna `{"status": "ok"}` com conexao ao banco confirmada
- Tabelas `terms`, `analyses`, `chat_sessions` existem no banco
- Backend inicia sem erros

---

## 3. Auth Persistente no Frontend

### Contexto
O `AuthContext.tsx` usa apenas estado React em memoria. Login se perde ao dar F5.

### Mudancas

**`frontend/src/contexts/AuthContext.tsx`**
- No `login()`: apos setar estado, salvar `{ setor, nomeUsuario }` no `localStorage`
- No carregamento inicial (useEffect ou useState initializer): ler do `localStorage` e restaurar
- No `logout()`: limpar `localStorage`

### Criterios de aceite
- Fazer login, dar F5, continuar logado
- Fazer logout, dar F5, estar deslogado

---

## 4. Validacao Frontend-Backend End-to-End

### Contexto
O frontend ja tem chamadas API em `services/api.ts` apontando para `http://localhost:8000/api/v1`. Precisamos garantir que os 3 fluxos funcionam de ponta a ponta.

### Fluxo: Chat com IA
1. Usuario abre tela de Chat
2. Seleciona modo (gerar/analisar/consultar)
3. Envia mensagem
4. Backend processa via Gemini, retorna streaming
5. Frontend exibe resposta incrementalmente

### Fluxo: Upload + Analise
1. Usuario abre tela de Upload
2. Seleciona PDF/DOCX dos exemplos em `docs/`
3. Frontend envia para `POST /api/v1/upload`
4. Backend extrai texto, roda NLP, analisa conformidade (10 criterios)
5. Frontend exibe score, status (aprovado/alerta/reprovado), criterios detalhados

### Fluxo: Dashboard
1. Usuario abre Dashboard
2. Frontend chama `GET /api/v1/dashboard/stats`
3. Se backend responde: exibe dados reais
4. Se backend falha: exibe dados mock com aviso

### Criterios de aceite
- Chat: mensagem enviada → resposta streaming aparece
- Upload: PDF enviado → score de conformidade exibido com criterios
- Dashboard: metricas carregam (reais ou mock com aviso)

---

## Fora de Escopo

- Workflow de aprovacao persistente (avancar etapas no backend)
- Autenticacao real com JWT/backend
- RAG com ChromaDB (indexacao de documentos legais)
- Testes automatizados
- Cleanup de codigo legado (App.jsx)
- PDF export

---

## Sequencia de Implementacao

1. Integracao Gemini no backend (maior impacto, mais complexo)
2. Auth persistente no frontend (rapido, independente)
3. Subir infra e rodar migrations (operacional)
4. Teste end-to-end dos 3 fluxos
5. Corrigir bugs encontrados durante teste

---

## Riscos e Mitigacoes

| Risco | Probabilidade | Mitigacao |
|-------|--------------|-----------|
| API Gemini indisponivel | Baixa | Fallback para mock ja existe no codigo |
| Docker nao instalado/funcionando | Media | Verificar antes de comecar |
| Upload falha com PDF especifico | Media | Testar com TRs de exemplo do `docs/` |
| Frontend nao conecta no backend | Baixa | CORS ja configurado para localhost:5173 |
