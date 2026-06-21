# Deploy da Aplicação FSPH

> **Status do ambiente de produção (verificado em 2026-06-21):**
> - **Frontend** ✅ no ar — Firebase Hosting
> - **Backend** ❌ retornando 503 — Cloud Run (instância sem saúde)
> - **Banco de dados** ❌ Cloud SQL `fsph-db-pg` (PostgreSQL 15) — **SUSPENDED**
> - **Causa raiz** 🔴 **Billing desabilitado no projeto GCP `fsph-colic`**

---

## Arquitetura de produção

```
Browser → Firebase Hosting (fsph-colic.web.app)
                ↓
         React/Vite SPA (estático)
                ↓  /api/v1/*
         Google Cloud Run (us-central1)
         fsph-backend-lagyelyfmq-uc.a.run.app
                ↓
         PostgreSQL (localização: ver abaixo)
```

### URLs de produção

| Serviço | URL |
|---------|-----|
| App (frontend) | <https://fsph-colic.web.app> |
| App (alias Firebase) | <https://fsph-colic.firebaseapp.com> |
| Backend API (produção) | <https://fsph-backend-lagyelyfmq-uc.a.run.app/api/v1> |
| Docs da API (Swagger) | <https://fsph-backend-lagyelyfmq-uc.a.run.app/docs> |

---

## Como o deploy foi realizado

### Frontend — Firebase Hosting

**Projeto Firebase:** `fsph-colic`

**Passo a passo do deploy manual (inferido — confirmar com o time):**

```bash
# 1. Build do frontend com a URL do backend de produção
cd frontend
VITE_API_URL=https://fsph-backend-lagyelyfmq-uc.a.run.app/api/v1 npm run build
# Gera: frontend/dist/

# 2. Deploy no Firebase Hosting
cd ..
firebase deploy --only hosting --project fsph-colic
```

**Evidência:** O bundle JS publicado (`/assets/index-CusG5XFz.js`) contém hardcoded `https://fsph-backend-lagyelyfmq-uc.a.run.app/api/v1`, confirmando que `VITE_API_URL` foi setado corretamente no build de produção.

**⚠️ Arquivos de configuração do Firebase ainda não estão versionados no repositório.**
Devem existir na máquina de quem fez o deploy. Recuperar e versionar:

```json
// firebase.json (esperado)
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

```json
// .firebaserc (esperado)
{
  "projects": {
    "default": "fsph-colic"
  }
}
```

---

### Backend — Google Cloud Run

**Serviço:** `fsph-backend`
**Região:** `us-central1`
**Imagem Docker:** baseada em `backend/Dockerfile`

**Passo a passo do deploy manual (inferido):**

```bash
# 1. Build e push da imagem para o Artifact Registry
docker build -t gcr.io/fsph-colic/fsph-backend ./backend

# 2. Deploy no Cloud Run
gcloud run deploy fsph-backend \
  --image gcr.io/fsph-colic/fsph-backend \
  --region us-central1 \
  --project fsph-colic \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=...,SECRET_KEY=..."
```

> ⚠️ As variáveis de ambiente exatas (DATABASE_URL, SECRET_KEY etc.) podem ser consultadas com:
> `gcloud run services describe fsph-backend --region us-central1 --project fsph-colic`

---

## Diagnóstico atual — Backend 503

### Causa raiz confirmada (2026-06-21)

**Billing desabilitado no projeto GCP `fsph-colic`.**

Log exato do Cloud Logging:
```
2026-06-21T00:00:34Z  ERROR  The request failed because billing is disabled for this project.
```

### Cadeia de falha

```
Billing desabilitado no GCP
    → Cloud SQL fsph-db-pg (PostgreSQL 15, us-central1-a): STATUS = SUSPENDED
    → Cloud Run não consegue abrir conexão com /cloudsql/fsph-colic:us-central1:fsph-db-pg
    → FastAPI crasha no startup (HTTP 500)
    → Instâncias subsequentes retornam HTTP 503
```

### Configuração atual do serviço (confirmada via `describe`)

| Campo | Valor |
|-------|-------|
| Revisão ativa | `fsph-backend-00055-48b` |
| Imagem | `us-central1-docker.pkg.dev/fsph-colic/fsph-backend/fsph-backend:dcf1e4c` |
| RAM | 512 Mi |
| CPU | 1 vCPU |
| Cloud SQL connection | `fsph-colic:us-central1:fsph-db-pg` |
| DATABASE_URL | `postgresql+asyncpg://postgres:***@/fsph?host=/cloudsql/fsph-colic:us-central1:fsph-db-pg` |
| Último deploy | 2026-06-16 por `fsph-github-deployer` (CI/CD automatizado) |

> ⚠️ **Nota de segurança:** `SECRET_KEY=minha-chave-secreta-fsph` é fraca. Trocar antes de ir para produção real.

### Como corrigir

**Passo único — reativar o billing no console GCP:**

1. Acessar: <https://console.cloud.google.com/billing/projects> (fazer login com a conta do projeto)
2. Localizar o projeto `fsph-colic`
3. Clicar em **"Link a billing account"** ou **"Enable billing"**
4. Selecionar ou criar uma conta de faturamento

Após reativar o billing:
- O Cloud SQL `fsph-db-pg` volta automaticamente em ~5 minutos
- O Cloud Run começa a aceitar conexões e o container sobe normalmente
- O frontend já está funcional — nenhuma ação necessária lá

### Verificar após reativar

```bash
# Confirmar que o banco voltou
gcloud sql instances list --project fsph-colic

# Testar o backend
curl https://fsph-backend-1008853799186.us-central1.run.app/api/v1/health

# Ver logs de startup limpos
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=fsph-backend" \
  --project fsph-colic --limit 20 --format="table(timestamp,severity,textPayload)"
```

---

## O que falta versionar neste repositório

| Arquivo | Estado | Ação |
|---------|--------|------|
| `firebase.json` | ❌ Não existe | Recuperar com quem fez o deploy e commitar |
| `.firebaserc` | ❌ Não existe | Recuperar com quem fez o deploy e commitar |
| Definição do serviço Cloud Run | ❌ Não existe | Criar `infra/cloudrun-backend.yaml` após `describe` |
| Secrets/variáveis de produção | ❌ Não documentado | Listar (sem valores!) em `infra/env-produção.example` |
| `.github/workflows/deploy.yml` | ❌ Não existe | Criar quando quiser automatizar o deploy |

---

## CI/CD atual

O arquivo `.github/workflows/ci.yml` só executa **CI** (lint + build), **não faz deploy**.
O deploy é **manual**, realizado localmente por alguém da equipe.

**Para automatizar no futuro (fora do escopo atual):**
- `firebase deploy --only hosting` via GitHub Actions (secret: `FIREBASE_SERVICE_ACCOUNT`)
- `gcloud run deploy` via GitHub Actions (secret: `GCP_SA_KEY`)

---

## Pré-requisitos locais para fazer deploy

```bash
# Firebase CLI
npm install -g firebase-tools
firebase login

# Google Cloud CLI
# https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project fsph-colic
```

---

*Documento criado em 2026-06-20. Seções marcadas com ❓ aguardam confirmação via console GCP/Firebase.*
