# Design: Pré-visualização de Documentos — Base de Conhecimento IA

**Data:** 2026-06-01  
**Escopo:** Tela Admin → "Base de Conhecimento IA" (`ContextDocumentsView`)

---

## Contexto

O admin pode fazer upload de documentos (PDF, DOCX, DOC, TXT) e textos puros que são indexados no ChromaDB como contexto RAG para a IA. Hoje não há como visualizar o conteúdo desses documentos sem baixá-los. O objetivo é adicionar uma prévia inline para inspeção rápida sem sair da tela.

---

## Decisões de Design

| Pergunta | Escolha |
|---|---|
| Onde aparece a prévia? | Modal centralizado (overlay) |
| O que mostrar? | PDF → documento embutido; DOCX/DOC/TXT → texto extraído |
| Limite de texto | Primeiros 3.000 caracteres, com indicação de truncamento |

---

## Backend

### Novo endpoint: `GET /api/v1/admin/context-documents/{id}/preview`

**Proteção:** `AdminUser` (mesmo padrão de todos os endpoints `/admin`).

**Lógica por tipo:**

| `mime_type` | Comportamento |
|---|---|
| `application/pdf` | Retorna `{ "type": "pdf", "download_url": "/api/v1/admin/context-documents/{id}/download" }` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) | Extrai texto via `DocumentService.extract_text_sync`, trunca em 3.000 chars |
| `application/msword` (DOC) | Idem DOCX |
| `text/plain` (TXT) | Lê com `file_path.read_text(encoding="utf-8")`, trunca em 3.000 chars |

**Schema de resposta:**

```python
class ContextDocumentPreview(BaseModel):
    type: Literal["pdf", "text"]
    text: str | None = None        # preenchido quando type == "text"
    truncated: bool = False        # True se o texto foi cortado em 3.000 chars
    download_url: str | None = None  # preenchido quando type == "pdf"
```

**Erros:**
- `404` — documento não encontrado no banco.
- `410` — arquivo físico ausente no disco.
- `422` — tipo de arquivo não suportado para prévia.

**Arquivo:** `backend/app/api/routes/admin.py` (novo endpoint após `download_context_document`).  
**Schema:** `backend/app/schemas/context_document.py` (novo `ContextDocumentPreview`).

---

## Frontend

### Novo componente: `DocumentPreviewModal`

**Arquivo:** `frontend/src/components/Admin/ContextDocumentsView.tsx` (inline no mesmo arquivo).

**Props:**
```typescript
interface DocumentPreviewModalProps {
  doc: ContextDocument | null;   // null fecha o modal
  onClose: () => void;
}
```

**Comportamento:**
- `doc === null` → modal não renderizado.
- Ao abrir: dispara a lógica de carregamento conforme `doc.mime_type`.
- Fecha com: botão X, tecla Escape, clique no backdrop.

**Fluxo por tipo:**

```
Abertura do modal
  ↓
  se mime_type === "application/pdf"
    → fetch GET /download com Authorization header
    → URL.createObjectURL(blob)
    → <iframe src={blobUrl} />
    → revogar URL ao fechar (URL.revokeObjectURL)

  senão
    → GET /preview (via previewContextDocument())
    → <pre> com texto retornado
    → badge "Texto truncado" se truncated === true
```

**Header do modal:**
- Nome do arquivo (`original_filename`)
- Badge de coleção (`collection`)
- Botão "Baixar original" (atalho para `downloadContextDocument`)
- Botão X (fechar)

**Estados:**
- `loading` — spinner centralizado
- `error` — mensagem de erro inline
- `ready` — conteúdo renderizado

### Botão de prévia na lista

- Ícone `Eye` (lucide-react, já disponível no projeto) adicionado à coluna de ações de cada linha em `DocumentList`.
- Sempre visível (independente de `status` ou `is_active`).
- `onClick` → `setPreviewDoc(doc)`.

### Novo tipo em `api.ts`

```typescript
export interface ContextDocumentPreviewResponse {
  type: 'pdf' | 'text';
  text?: string;
  truncated?: boolean;
  download_url?: string;
}

export async function previewContextDocument(
  id: string
): Promise<ContextDocumentPreviewResponse> {
  return request<ContextDocumentPreviewResponse>(
    `/admin/context-documents/${id}/preview`
  );
}
```

### Novo tipo em `types/index.ts`

Adicionar `ContextDocumentPreviewResponse` ao arquivo de tipos.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `backend/app/api/routes/admin.py` | Novo endpoint `GET /{id}/preview` |
| `backend/app/schemas/context_document.py` | Schema `ContextDocumentPreview` |
| `frontend/src/services/api.ts` | Função `previewContextDocument` + interface |
| `frontend/src/types/index.ts` | Interface `ContextDocumentPreviewResponse` |
| `frontend/src/components/Admin/ContextDocumentsView.tsx` | Componente `DocumentPreviewModal` + botão Eye na lista |

---

## Fora de Escopo

- Renderização de DOCX com layout original (apenas texto extraído).
- Paginação do texto extraído.
- Zoom/controles avançados no PDF viewer (o `<iframe>` usa o viewer nativo do browser).
- Prévia de documentos com status `failed` (arquivo pode não existir).
