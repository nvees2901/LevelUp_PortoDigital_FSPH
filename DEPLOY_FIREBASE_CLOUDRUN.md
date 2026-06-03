# Deploy Firebase Hosting + Cloud Run

Este documento explica como deixar a aplicação totalmente online, com frontend hospedado no Firebase Hosting e backend rodando no Cloud Run.

## 1. Visão geral

- **Frontend**: hospedado no Firebase Hosting (`fsph-colic`)
- **Backend**: implantado no Google Cloud Run
- **Banco de dados**: PostgreSQL gerenciado (Cloud SQL ou outro serviço compatível)
- **Uploads e documentos de contexto**: armazenados em Google Cloud Storage via `GCS_BUCKET`
- **RAG**: opcional. Deve ser habilitado apenas se um servidor ChromaDB estiver disponível

## 2. O que foi implementado no código

- `backend/app/services/storage.py`
  - abstração de armazenamento local e Google Cloud Storage
  - `save_upload` e `save_context_document` gravam no bucket quando `GCS_BUCKET` estiver configurado
  - `read_bytes`, `delete`, `exists` suportam `gs://...`

- `backend/app/api/routes/upload.py`
  - upload de TRs agora usa `save_upload()`
  - elimina dependência de gravação local em `uploads/`

- `backend/app/api/routes/admin.py`
  - upload de documentos de contexto agora usa `save_context_document()`
  - download e exclusão funcionam tanto para armazenamento local quanto para Cloud Storage

- `backend/app/services/rag_service.py`
  - indexação de documentos do admin aceita caminhos `gs://...`
  - documentos PDF e DOCX podem ser lidos diretamente do bucket

- `backend/app/core/config.py`
  - novas variáveis: `GCS_BUCKET`, `GCS_UPLOAD_PREFIX`, `GCS_CONTEXT_DOCS_PREFIX`

- `backend/.env.production.example`
  - adicionadas variáveis de configuração do GCS

- `frontend/.env.production.example`
  - criado modelo de produção do frontend

- `README.md`
  - referência ao novo guia de deploy `DEPLOY_FIREBASE_CLOUDRUN.md`

## 3. Variáveis de ambiente necessárias

### Backend (`backend/.env.production`)

```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:<port>/<database>
SECRET_KEY=uma-chave-secreta-forte
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
ENVIRONMENT=production
DEBUG=false
RAG_ENABLED=false
OLLAMA_BASE_URL=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
GCS_BUCKET=<seu-bucket>
GCS_UPLOAD_PREFIX=uploads
GCS_CONTEXT_DOCS_PREFIX=context_documents
```

### Frontend (`frontend/.env.production`)

```env
VITE_API_URL=/api/v1
```

## 4. Configurar o bucket do Cloud Storage

1. Crie um bucket no Google Cloud Storage.
2. Defina o nome no `GCS_BUCKET` do `backend/.env.production`.
3. No Cloud Run, o serviço deve ter permissão para acessar o bucket.
   - Conceda a role `Storage Object Admin` ao service account do Cloud Run

## 5. Deploy do backend no Cloud Run

1. Coloque os secrets no GitHub Actions ou na configuração do Cloud Run:
   - `DATABASE_URL`
   - `SECRET_KEY`
   - `GCS_BUCKET`
   - `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `OLLAMA_BASE_URL`
2. Ajuste `.github/workflows/deploy-cloud-run.yml` se necessário.
3. O workflow exemplo já faz build e deploy para Cloud Run com as variáveis:
   - `GCP_SA_KEY`
   - `GCP_PROJECT`
   - `CLOUD_RUN_SERVICE`
   - `CLOUD_RUN_REGION`
4. Após deploy, confirme que o serviço está acessível e retorna `200` em `/api/v1/health`.

## 6. Deploy do frontend no Firebase Hosting

1. Instale o Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Autentique-se e selecione o projeto:
   ```bash
   firebase login
   firebase use fsph-colic
   ```
3. Gere o build do frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
4. Faça deploy:
   ```bash
   firebase deploy --only hosting --project fsph-colic
   ```

### GitHub Actions: automatizando o deploy do frontend

- Adicione o secret `FIREBASE_TOKEN` no repositório (Settings → Secrets → Actions). Gere o token localmente com:

```bash
firebase login:ci
# copie o token retornado e cole em Settings → Secrets → Actions → FIREBASE_TOKEN
```

- O workflow `/.github/workflows/deploy-frontend-firebase.yml` foi criado e é acionado ao dar push na `main`.

### GitHub Actions: backend (Cloud Run)

- O workflow `/.github/workflows/deploy-cloud-run.yml` usa um Service Account JSON no secret `GCP_SA_KEY` e espera os secrets:
  - `GCP_PROJECT` — ID do projeto GCP
  - `CLOUD_RUN_SERVICE` — nome do serviço Cloud Run (ex: `fsph-backend`)
  - `CLOUD_RUN_REGION` — região (ex: `us-central1`)
  - `DATABASE_URL`, `SECRET_KEY` etc.

- Para criar a Service Account e a chave JSON (execute localmente com `gcloud`):

```bash
gcloud iam service-accounts create fsph-github-deployer --display-name "FSPh GitHub Deployer"
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=fsph-github-deployer@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com
# Em seguida, adicione o conteúdo de sa-key.json como secret `GCP_SA_KEY` no GitHub
```

### Rodando manualmente (opcional)

Se preferir rodar os comandos manualmente ao invés do workflow:

Backend build & deploy (local, precisa `gcloud` autenticado):

```bash
docker build -t gcr.io/$GCP_PROJECT/fsph-backend:latest backend
docker push gcr.io/$GCP_PROJECT/fsph-backend:latest
gcloud run deploy $CLOUD_RUN_SERVICE --image gcr.io/$GCP_PROJECT/fsph-backend:latest --region $CLOUD_RUN_REGION --platform managed --allow-unauthenticated --set-env-vars "ENVIRONMENT=production,DATABASE_URL=$DATABASE_URL,SECRET_KEY=$SECRET_KEY,GCS_BUCKET=$GCS_BUCKET"
```

Frontend build & deploy (local):

```bash
cd frontend
npm ci
npm run build
firebase deploy --only hosting --project fsph-colic
```

## 7. Configuração do `firebase.json`

O arquivo já foi configurado para:

```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "fsph-backend",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

- `serviceId` deve ser o nome do serviço Cloud Run.
- `region` deve corresponder à região do serviço.

## 8. Observações finais

- O Firebase Hosting serve apenas o frontend.
- O backend roda no Cloud Run e precisa de um banco PostgreSQL online.
- O armazenamento de arquivos agora pode ser feito em Cloud Storage, tornando o app independente do sistema de arquivos local.
- Se você não quiser usar RAG, mantenha `RAG_ENABLED=false`.
