import type {
  TermResponse,
  TermListResponse,
  TermCreate,
  TermUpdate,
  AnalysisResponse,
  ChatMode,
  ChatRequest,
  ChatResponse,
  ChatSessionResponse,
  ChatSessionListResponse,
  DashboardStats,
  ContextDocument,
  ContextDocumentList,
  ContextDocumentPreviewResponse,
  KnowledgeBaseCollectionList,
  TermChecklistOut,
  WorkflowEventOut,
  UserAdminOut,
  UserCreate,
  UserUpdate,
} from '../types';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const TOKEN_KEY = 'fsph_token';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Parse a failed response into an ApiError.
 * FastAPI sends { detail: string | object }; we surface that as .message
 * so all UI catch-blocks can read `err.message` uniformly.
 */
async function parseResponseError(response: Response, fallback: string): Promise<ApiError> {
  const body = await response.json().catch(() => ({}));
  let message: string;
  if (typeof body.detail === 'string') {
    message = body.detail;
  } else if (Array.isArray(body.detail)) {
    // FastAPI validation errors (422): array of {loc, msg, type}
    message = body.detail.map((e: { loc?: string[]; msg: string }) => {
      const field = e.loc?.slice(1).join('.') ?? '';
      return field ? `${field}: ${e.msg}` : e.msg;
    }).join(' | ');
  } else {
    message = body.message || fallback;
  }
  return new ApiError(response.status, message, typeof body.detail === 'string' ? body.detail : undefined);
}

/**
 * Core HTTP helper.
 *
 * - Automatically attaches the auth header and Content-Type: application/json
 *   (Content-Type is omitted when the body is FormData so the browser can set
 *    the multipart boundary).
 * - Dispatches a custom `auth:401` DOM event on 401 responses so AuthContext
 *   can react without a direct dependency on the service layer.
 * - Returns `undefined` (cast to T) for 204 No Content responses.
 */
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const { headers: extraHeaders, body, ...restOptions } = options ?? {};

  const isFormData = body instanceof FormData;
  const contentTypeHeader: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const response = await fetch(url, {
    ...restOptions,
    body,
    headers: {
      ...contentTypeHeader,
      ...getAuthHeader(),
      ...(extraHeaders as Record<string, string> | undefined),
    },
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:401'));
    throw await parseResponseError(response, `Erro ${response.status}`);
  }

  if (!response.ok) {
    throw await parseResponseError(response, `Erro ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// --- Terms ---

export async function getTerms(params?: {
  page?: number;
  limit?: number;
  category?: string;
  status?: string;
  search?: string;
}): Promise<TermListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.category) query.set('category', params.category);
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return request<TermListResponse>(`/terms${qs ? `?${qs}` : ''}`);
}

export async function getTerm(id: string): Promise<TermResponse> {
  return request<TermResponse>(`/terms/${id}`);
}

export async function createTerm(data: TermCreate): Promise<TermResponse> {
  return request<TermResponse>('/terms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTerm(id: string, data: TermUpdate): Promise<TermResponse> {
  return request<TermResponse>(`/terms/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTerm(id: string): Promise<void> {
  return request<void>(`/terms/${id}`, { method: 'DELETE' });
}

export async function getPendentes(): Promise<TermResponse[]> {
  return request<TermResponse[]>('/terms/pendentes');
}

export interface ExportOptions {
  autoridade?: string;
  autoridadeCargo?: string;
}

function exportQuery(opts?: ExportOptions): string {
  const qs = new URLSearchParams();
  if (opts?.autoridade?.trim()) qs.set('autoridade', opts.autoridade.trim());
  if (opts?.autoridadeCargo?.trim()) qs.set('autoridade_cargo', opts.autoridadeCargo.trim());
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function exportTermPdf(id: string, opts?: ExportOptions): Promise<Blob> {
  const url = `${API_BASE}/terms/${id}/export/pdf${exportQuery(opts)}`;
  const response = await fetch(url, { headers: getAuthHeader() });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:401'));
    throw await parseResponseError(response, 'Erro ao exportar PDF');
  }
  return response.blob();
}

export async function exportTermDocx(id: string, opts?: ExportOptions): Promise<Blob> {
  const url = `${API_BASE}/terms/${id}/export/docx${exportQuery(opts)}`;
  const response = await fetch(url, { headers: getAuthHeader() });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:401'));
    throw await parseResponseError(response, 'Erro ao exportar DOCX');
  }
  return response.blob();
}

export async function getChecklist(termId: string): Promise<TermChecklistOut> {
  return request<TermChecklistOut>(`/terms/${termId}/checklist`);
}

export async function getHistorico(termId: string): Promise<WorkflowEventOut[]> {
  return request<WorkflowEventOut[]>(`/terms/${termId}/historico`);
}

export async function avancarTermo(termId: string, observacao?: string): Promise<TermResponse> {
  return request<TermResponse>(`/terms/${termId}/avancar`, {
    method: 'POST',
    body: JSON.stringify({ observacao: observacao ?? null }),
  });
}

export async function devolverTermo(termId: string, observacao: string): Promise<TermResponse> {
  return request<TermResponse>(`/terms/${termId}/devolver`, {
    method: 'POST',
    body: JSON.stringify({ observacao }),
  });
}

// --- Upload ---

export async function uploadDocument(file: File): Promise<{ term: TermResponse; analysis: AnalysisResponse }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ term: TermResponse; analysis: AnalysisResponse }>('/upload', {
    method: 'POST',
    body: formData,
  });
}

// --- Analysis ---

export async function analyzeTerm(termId: string): Promise<AnalysisResponse> {
  return request<AnalysisResponse>('/analysis', {
    method: 'POST',
    body: JSON.stringify({ term_id: termId }),
  });
}

export async function getAnalysesByTerm(termId: string): Promise<AnalysisResponse[]> {
  return request<AnalysisResponse[]>(`/analysis/term/${termId}`);
}

export async function getAnalysis(id: string): Promise<AnalysisResponse> {
  return request<AnalysisResponse>(`/analysis/${id}`);
}

// --- Chat ---

export async function sendChatMessage(data: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (meta: { session_id: string; mode: string; generated_term_id: string | null }) => void;
  onError: (error: Error) => void;
}

export async function streamChatMessage(data: ChatRequest, callbacks: StreamCallbacks): Promise<void> {
  const url = `${API_BASE}/chat/stream`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:401'));
    throw await parseResponseError(response, `Erro ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream não suportado');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.done) {
          callbacks.onDone(parsed);
        } else if (parsed.token) {
          callbacks.onToken(parsed.token);
        }
      } catch {
        // Ignora linhas que não são JSON válido
      }
    }
  }
}

export async function getChatSession(id: string): Promise<ChatSessionResponse> {
  return request<ChatSessionResponse>(`/chat/${id}`);
}

export async function deleteChatSession(id: string): Promise<void> {
  return request<void>(`/chat/${id}`, { method: 'DELETE' });
}

export async function finalizeChatSession(sessionId: string): Promise<{ term_id: string }> {
  return request<{ term_id: string }>(`/chat/${sessionId}/finalize`, { method: 'POST' });
}

// --- Dashboard ---

export async function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/dashboard/stats');
}

// --- Admin: Context Documents ---

export async function listContextDocuments(): Promise<ContextDocumentList> {
  return request<ContextDocumentList>('/admin/context-documents');
}

export async function uploadContextDocument(
  file: File,
  collection: 'prompt' | 'tr' = 'prompt',
): Promise<ContextDocument> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('collection', collection);
  return request<ContextDocument>('/admin/context-documents', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteContextDocument(id: string): Promise<void> {
  return request<void>(`/admin/context-documents/${id}`, { method: 'DELETE' });
}

export async function reindexContextDocument(id: string): Promise<ContextDocument> {
  return request<ContextDocument>(`/admin/context-documents/${id}/reindex`, { method: 'POST' });
}

export async function deactivateContextDocument(id: string): Promise<ContextDocument> {
  return request<ContextDocument>(`/admin/context-documents/${id}/deactivate`, { method: 'POST' });
}

export async function activateContextDocument(id: string): Promise<ContextDocument> {
  return request<ContextDocument>(`/admin/context-documents/${id}/activate`, { method: 'POST' });
}

export async function downloadContextDocument(id: string, filename: string): Promise<void> {
  const url = `${API_BASE}/admin/context-documents/${id}/download`;
  const response = await fetch(url, { headers: getAuthHeader() });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:401'));
    throw await parseResponseError(response, 'Erro ao baixar arquivo');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }, 100);
}

export async function createTextContextDocument(
  title: string,
  content: string,
  collection: 'prompt' | 'tr' = 'prompt',
): Promise<ContextDocument> {
  return request<ContextDocument>('/admin/context-documents/text', {
    method: 'POST',
    body: JSON.stringify({ title, content, collection }),
  });
}

export async function getKnowledgeBaseCollections(): Promise<KnowledgeBaseCollectionList> {
  return request<KnowledgeBaseCollectionList>('/admin/knowledge-base/collections');
}

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

// --- Chat Sessions ---

export async function listChatSessions(mode?: ChatMode): Promise<ChatSessionListResponse> {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  return request<ChatSessionListResponse>(`/chat/sessions${qs}`);
}

// --- Admin: Users ---

export async function listUsers(): Promise<UserAdminOut[]> {
  return request<UserAdminOut[]>('/admin/users');
}

export async function createUser(data: UserCreate): Promise<UserAdminOut> {
  return request<UserAdminOut>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: UserUpdate): Promise<UserAdminOut> {
  return request<UserAdminOut>(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  return request<void>(`/admin/users/${id}`, { method: 'DELETE' });
}

export async function deleteUserPermanently(id: string): Promise<void> {
  return request<void>(`/admin/users/${id}/permanently`, { method: 'DELETE' });
}
