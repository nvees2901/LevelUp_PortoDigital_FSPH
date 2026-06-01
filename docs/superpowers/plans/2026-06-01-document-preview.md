# Document Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar pré-visualização de documentos indexados na tela "Base de Conhecimento IA" — modal com PDF embutido via iframe ou texto extraído para DOCX/TXT.

**Architecture:** Novo endpoint `GET /admin/context-documents/{id}/preview` no backend retorna tipo + conteúdo. Frontend abre modal com iframe (PDF) ou texto extraído (outros tipos), buscando o arquivo com header Authorization.

**Tech Stack:** FastAPI + Pydantic v2 (backend), React + TypeScript + Tailwind + lucide-react (frontend).

**Sem suite de testes automatizados** — verificação é manual via browser/curl.

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `backend/app/schemas/context_document.py` | Adicionar `ContextDocumentPreview` |
| `backend/app/api/routes/admin.py` | Adicionar endpoint `GET /{doc_id}/preview` |
| `frontend/src/types/index.ts` | Adicionar `ContextDocumentPreviewResponse` |
| `frontend/src/services/api.ts` | Adicionar `previewContextDocument` + `fetchContextDocumentBlob` |
| `frontend/src/components/Admin/ContextDocumentsView.tsx` | Adicionar `DocumentPreviewModal`, `Eye` import, `onPreview` prop em `DocumentList`, estado no root |

---

## Task 1: Schema + Endpoint de prévia (backend)

**Arquivos:**
- Modify: `backend/app/schemas/context_document.py`
- Modify: `backend/app/api/routes/admin.py`

### 1.1 — Adicionar schema `ContextDocumentPreview`

Em `backend/app/schemas/context_document.py`, logo após `ContextDocumentList`, adicionar:

```python
class ContextDocumentPreview(BaseModel):
    """Resposta da prévia de um documento de contexto."""
    type: Literal["pdf", "text"]
    text: str | None = None
    truncated: bool = False
    download_url: str | None = None
```

O import `from typing import Literal` já existe no arquivo. Não é necessário adicionar nada mais.

- [ ] Abrir `backend/app/schemas/context_document.py` e inserir a classe acima após `ContextDocumentList`.

### 1.2 — Importar o schema em `admin.py`

Em `backend/app/api/routes/admin.py`, no bloco de imports de schemas (linhas ~27-32), adicionar `ContextDocumentPreview` à lista:

```python
from app.schemas.context_document import (
    ContextDocumentList,
    ContextDocumentResponse,
    ContextDocumentTextCreate,
    ContextDocumentPreview,
    KnowledgeBaseCollection,
    KnowledgeBaseCollectionList,
)
```

- [ ] Atualizar o import em `admin.py`.

### 1.3 — Adicionar endpoint `GET /context-documents/{doc_id}/preview`

Em `backend/app/api/routes/admin.py`, inserir o endpoint **após** `download_context_document` (GET download) e **antes** de `deactivate_context_document`:

```python
@router.get("/context-documents/{doc_id}/preview", response_model=ContextDocumentPreview)
async def preview_context_document(doc_id: str, db: DbDep, current_user: AdminUser):
    """Retorna prévia do conteúdo de um documento de contexto."""
    doc = await ContextDocumentRepository.get_by_id(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    if not Path(doc.storage_path).exists():
        raise HTTPException(
            status_code=410,
            detail="Arquivo físico não encontrado no storage.",
        )

    if doc.mime_type == "application/pdf":
        return ContextDocumentPreview(
            type="pdf",
            download_url=f"/api/v1/admin/context-documents/{doc_id}/download",
        )

    PREVIEW_LIMIT = 3000

    if doc.mime_type == "text/plain":
        text = await asyncio.to_thread(
            lambda: Path(doc.storage_path).read_text(encoding="utf-8")
        )
    else:
        file_bytes = await asyncio.to_thread(Path(doc.storage_path).read_bytes)
        from app.services.document import DocumentService
        text = await asyncio.to_thread(
            DocumentService.extract_text_sync, file_bytes, doc.filename
        )
        del file_bytes

    truncated = len(text) > PREVIEW_LIMIT
    return ContextDocumentPreview(
        type="text",
        text=text[:PREVIEW_LIMIT] if truncated else text,
        truncated=truncated,
    )
```

- [ ] Inserir o endpoint no local correto em `admin.py`.

### 1.4 — Verificar manualmente

- [ ] Reiniciar o backend: `docker compose restart backend` (ou `docker compose up -d --force-recreate backend` se necessário).
- [ ] Testar endpoint PDF:
  ```bash
  curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/v1/admin/context-documents/<DOC_ID_PDF>/preview | python -m json.tool
  ```
  Esperado: `{"type": "pdf", "download_url": "/api/v1/admin/context-documents/.../download", "text": null, "truncated": false}`
- [ ] Testar endpoint TXT/DOCX: esperado `{"type": "text", "text": "...", "truncated": true|false}`.
- [ ] Testar com doc_id inválido: esperado 404. Testar com arquivo físico ausente: esperado 410.

### 1.5 — Commit

```bash
git add backend/app/schemas/context_document.py backend/app/api/routes/admin.py
git commit -m "feat(admin): endpoint GET /context-documents/{id}/preview para pré-visualização"
```

- [ ] Commit realizado.

---

## Task 2: Tipos e funções de API (frontend)

**Arquivos:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

### 2.1 — Adicionar `ContextDocumentPreviewResponse` em `types/index.ts`

Logo após a interface `ContextDocumentList` (após linha ~209), adicionar:

```typescript
export interface ContextDocumentPreviewResponse {
  type: 'pdf' | 'text';
  text?: string;
  truncated?: boolean;
  download_url?: string;
}
```

- [ ] Inserir a interface em `frontend/src/types/index.ts`.

### 2.2 — Adicionar funções em `api.ts`

No bloco de funções de context documents em `frontend/src/services/api.ts`, após `getKnowledgeBaseCollections`, adicionar:

```typescript
export async function previewContextDocument(id: string): Promise<ContextDocumentPreviewResponse> {
  return request<ContextDocumentPreviewResponse>(`/admin/context-documents/${id}/preview`);
}

export async function fetchContextDocumentBlob(id: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/admin/context-documents/${id}/download`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('Falha ao carregar o arquivo.');
  return response.blob();
}
```

- [ ] Adicionar as duas funções em `api.ts`.

### 2.3 — Verificar TypeScript

- [ ] Rodar `cd frontend && npx tsc --noEmit` e confirmar que não há erros de tipo.

### 2.4 — Commit

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat(frontend): types e funções de API para pré-visualização de documentos"
```

- [ ] Commit realizado.

---

## Task 3: Modal de prévia + botão Eye (frontend)

**Arquivos:**
- Modify: `frontend/src/components/Admin/ContextDocumentsView.tsx`

### 3.1 — Adicionar `Eye` aos imports de lucide-react

Na linha 2-6 do arquivo, adicionar `Eye` à lista de imports:

```typescript
import {
  Upload, FileText, Trash2, RefreshCw, Brain, CheckCircle2,
  Clock, AlertCircle, Download, AlertTriangle, ChevronDown,
  ChevronRight, Scale, FileCheck, FolderOpen, X, Power, PowerOff, Eye,
} from 'lucide-react';
```

- [ ] Atualizar o import em `ContextDocumentsView.tsx`.

### 3.2 — Importar as novas funções de API

Na linha ~8-17 (bloco de imports de serviços), adicionar `previewContextDocument` e `fetchContextDocumentBlob`:

```typescript
import {
  listContextDocuments,
  uploadContextDocument,
  deleteContextDocument,
  reindexContextDocument,
  deactivateContextDocument,
  activateContextDocument,
  downloadContextDocument,
  getKnowledgeBaseCollections,
  createTextContextDocument,
  previewContextDocument,
  fetchContextDocumentBlob,
} from '../../services/api';
```

E importar o tipo da prévia:

```typescript
import type { ContextDocument, ContextDocumentPreviewResponse } from '../../types';
```

(Se o import de tipos já existir, apenas adicionar `ContextDocumentPreviewResponse`.)

- [ ] Atualizar os imports em `ContextDocumentsView.tsx`.

### 3.3 — Adicionar componente `DocumentPreviewModal`

Inserir o componente antes do componente `ContextDocumentsView` (root), após `DeleteConfirmModal`:

```typescript
// ─── DocumentPreviewModal ─────────────────────────────────────────────────────

interface DocumentPreviewModalProps {
  doc: ContextDocument | null;
  onClose: () => void;
}

function DocumentPreviewModal({ doc, onClose }: DocumentPreviewModalProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState<ContextDocumentPreviewResponse | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!doc) return;
    setState('loading');
    setPreview(null);
    setBlobUrl(null);
    setErrorMsg('');

    if (doc.mime_type === 'application/pdf') {
      fetchContextDocumentBlob(doc.id)
        .then(blob => {
          setBlobUrl(URL.createObjectURL(blob));
          setState('ready');
        })
        .catch(() => {
          setErrorMsg('Não foi possível carregar o PDF.');
          setState('error');
        });
    } else {
      previewContextDocument(doc.id)
        .then(data => {
          setPreview(data);
          setState('ready');
        })
        .catch(() => {
          setErrorMsg('Não foi possível carregar a prévia.');
          setState('error');
        });
    }
  }, [doc]);

  // Revogar blob URL ao fechar para liberar memória
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!doc) return null;

  const collectionLabel: Record<string, string> = {
    context_extra: 'Adicional',
    lei_14133: 'Lei 14.133',
    termos_aprovados: 'TRs Aprovados',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <FileText size={16} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{doc.original_filename}</p>
            <p className="text-xs text-slate-400">{collectionLabel[doc.collection] ?? doc.collection}</p>
          </div>
          <button
            onClick={() => downloadContextDocument(doc.id, doc.original_filename)}
            title="Baixar arquivo original"
            className="p-2 text-slate-400 hover:text-brand-primary hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Download size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {state === 'loading' && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-primary border-t-transparent" />
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-center justify-center h-64 text-sm text-red-500 gap-2">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}

          {state === 'ready' && doc.mime_type === 'application/pdf' && blobUrl && (
            <iframe
              src={blobUrl}
              className="w-full h-full"
              style={{ minHeight: '70vh' }}
              title={doc.original_filename}
            />
          )}

          {state === 'ready' && preview && (
            <div className="h-full overflow-y-auto p-5">
              {preview.truncated && (
                <div className="mb-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} />
                  Exibindo apenas os primeiros 3.000 caracteres.
                </div>
              )}
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                {preview.text}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] Inserir `DocumentPreviewModal` no arquivo, após `DeleteConfirmModal`.

### 3.4 — Adicionar `onPreview` à interface e botão Eye em `DocumentList`

Localizar a interface de props de `DocumentList` (procure `interface DocumentListProps` ou a assinatura da função `DocumentList`). Adicionar `onPreview: (doc: ContextDocument) => void` aos props.

Localizar o botão de Download (linha ~565) e inserir o botão Eye **antes** dele:

```tsx
<button
  onClick={() => onPreview(doc)}
  title="Pré-visualizar documento"
  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
>
  <Eye size={14} />
</button>
```

- [ ] Adicionar `onPreview` à interface de props de `DocumentList`.
- [ ] Inserir o botão Eye na coluna de ações.

### 3.5 — Adicionar estado e modal no componente raiz `ContextDocumentsView`

No componente raiz `ContextDocumentsView`, localizar o bloco de `useState` (próximo ao início do componente) e adicionar:

```typescript
const [previewDoc, setPreviewDoc] = useState<ContextDocument | null>(null);
```

Localizar onde `DocumentList` é renderizado (próximo ao final do JSX do root) e passar `onPreview`:

```tsx
<DocumentList
  docs={docs}
  loading={docsLoading}
  onDownload={handleDownload}
  onRetry={handleRetry}
  onToggleActive={handleToggleActive}
  onDelete={doc => setDeleteTarget(doc)}
  onPreview={doc => setPreviewDoc(doc)}   {/* novo */}
  onRefresh={fetchDocs}
/>
```

Logo antes do `{/* Delete modal */}` (linha ~825), inserir o modal de prévia:

```tsx
{/* Preview modal */}
<DocumentPreviewModal
  doc={previewDoc}
  onClose={() => setPreviewDoc(null)}
/>
```

- [ ] Adicionar estado `previewDoc` ao componente raiz.
- [ ] Passar `onPreview` para `DocumentList`.
- [ ] Renderizar `DocumentPreviewModal` no JSX raiz.

### 3.6 — Verificar TypeScript

- [ ] Rodar `cd frontend && npx tsc --noEmit`. Corrigir qualquer erro de tipo antes de continuar.

### 3.7 — Verificar no browser

- [ ] Com o stack rodando (`docker compose up -d frontend`), abrir `http://localhost:3000`.
- [ ] Fazer login como `ADMIN-001` / `senha123` e navegar para "Base de Conhecimento IA".
- [ ] Confirmar que o ícone `Eye` aparece na coluna de ações de cada documento.
- [ ] Clicar no Eye de um documento TXT ou DOCX: modal deve abrir com texto extraído.
- [ ] Se houver documento PDF: modal deve exibir iframe com o PDF renderizado.
- [ ] Fechar modal com X, Escape e clique no backdrop — todos devem funcionar.
- [ ] Abrir preview de documento com `status === "failed"` e confirmar que exibe mensagem de erro (410 do backend → estado `error` no modal).

### 3.8 — Commit

```bash
git add frontend/src/components/Admin/ContextDocumentsView.tsx
git commit -m "feat(frontend): modal de pré-visualização de documentos na Base de Conhecimento IA"
```

- [ ] Commit realizado.
