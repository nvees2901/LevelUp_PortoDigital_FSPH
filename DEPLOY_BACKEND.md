Deploy do backend — instruções completas

Opções recomendadas: Render (mais simples) ou Fly.io (leve e grátis para pequenos projetos) ou Google Cloud Run.

1) Build & publish imagem (GitHub Container Registry)

- O repositório já contém um workflow GitHub Actions em `.github/workflows/build-and-push-backend.yml` que:
  - constrói a imagem Docker do `backend` e publica em `ghcr.io/<OWNER>/fsph-backend:latest`.
  - não requer tokens adicionais se `GITHUB_TOKEN` tiver permissão `packages: write` (GitHub Actions default). Se houver erro, crie um `PERSONAL_ACCESS_TOKEN` com `write:packages` como `CR_PAT` e adicione em `Secrets`.

2) Deploy no Render (exemplo)

- Criar conta em https://render.com e criar um `Web Service` do tipo `Docker` apontando para a imagem `ghcr.io/<OWNER>/fsph-backend:latest` ou conectar o repositório e configurar deploy automático por branch.
- Criar um banco gerenciado Postgres (Render Databases) e adicionar as variáveis de ambiente no serviço (`DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT=production`, etc.).
- Rodar migrações via Console do Render (One-off Command):

```bash
# no Render Console > Shell do serviço
uv run alembic upgrade head
```

- Para popular usuários (seed): o script `scripts/seed_users.py` evita execução quando `ENVIRONMENT=production`. Use um one-off temporário com `ENVIRONMENT=staging` ou rode inserts SQL diretamente:

```bash
# Exemplo: rodar seed manualmente (usando um container temporário que tenha o código):
docker run --rm \
  -e DATABASE_URL="<DATABASE_URL>" \
  -e ENVIRONMENT=development \
  ghcr.io/<OWNER>/fsph-backend:latest \
  uv run python -m scripts.seed_users
```

3) Deploy no Fly.io (exemplo)

- Instale `flyctl` e crie app: `flyctl launch` (siga wizard para criar app e Postgres)
- Configure `Dockerfile` build — já existe em `backend/Dockerfile`.
- Publique: `flyctl deploy --image ghcr.io/<OWNER>/fsph-backend:latest`
- Migrações e seed: `flyctl ssh console -a <app> -- uv run alembic upgrade head` e seed com `ENVIRONMENT` temporário conforme exemplo acima.

4) Cloud Run (GCP)

- Faça build e push para Google Container Registry / Artifact Registry.
- Crie serviço Cloud Run apontando para a imagem.
- Configure Cloud SQL (Postgres) ou use um banco gerenciado e ajuste `DATABASE_URL`.
- Execute migrações com um job de inicialização ou `gcloud beta run jobs execute`.

5) Depois do backend no ar

- Configure o frontend para apontar para a URL pública da API. No `frontend/.env.production` defina:

```
VITE_API_URL=https://api.seu-dominio.com/api/v1
```

- Rebuild e redeploy do frontend para o Firebase Hosting:

```bash
cd frontend
npm run build
firebase deploy --only hosting --project fsph-colic
```

6) Observações de segurança

- Nunca comite `backend/firebase-key.json` nem `backend/.env.production` com segredos.
- Use secrets do provedor (Render / Fly / GitHub Secrets) para armazenar `SECRET_KEY`, `DATABASE_URL`, `OPENAI_*`.

Se quiser, eu posso:
- configurar o workflow para deploy automático em Render (precisa de `RENDER_SERVICE_ID` e `RENDER_API_KEY`), ou
- configurar deploy para Fly.io (precisa de `FLY_API_TOKEN`) ou
- ajudar a executar os passos acima se você me fornecer o provedor e permissões.

7) Cloud Run — passos detalhados e criação de Service Account

- Criar Service Account e chave (local):

```bash
# autentique com sua conta GCP
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

# criar service account
gcloud iam service-accounts create fsph-github-deployer --display-name "FSPh GitHub Deployer"

# dar papéis necessários
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"  # se usar Cloud SQL

# criar chave JSON
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com
```

- Adicione os secrets no GitHub do repositório: `GCP_SA_KEY` (conteúdo do `sa-key.json`), `GCP_PROJECT` (ID do projeto), `CLOUD_RUN_SERVICE` (nome do serviço final), `CLOUD_RUN_REGION` (ex: us-central1), `DATABASE_URL`, `SECRET_KEY`.

- O workflow exemplo que criei é `.github/workflows/deploy-cloud-run.yml`. Ele espera os secrets acima e fará build/push/`gcloud run deploy`.

- Depois de deployar no Cloud Run, ajuste `firebase.json` para criar um rewrite `/api/**` apontando para o `serviceId` do Cloud Run (já atualizei esse arquivo com placeholders). Em seguida rode:

```bash
cd frontend
npm run build
firebase deploy --only hosting --project fsph-colic
```

- Migrações & seed: recomendo rodar migrações manualmente uma vez via Cloud Run jobs ou via console do provedor. Exemplo com `gcloud run jobs` está no README oficial do GCP (procure "Cloud Run jobs").

Se quiser, eu cadastro o workflow final com variáveis reais e faço o primeiro deploy — você só precisa me fornecer os secrets listados acima, ou posso guiar você na criação da service account e upload do secret no GitHub.
