import type {
  TermResponse,
  TermListResponse,
  TermCreate,
  TermUpdate,
  AnalysisResponse,
  ChatRequest,
  ChatResponse,
  ChatSessionResponse,
  DashboardStats,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('fsph_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const { headers: extraHeaders, ...restOptions } = options ?? {};
  const response = await fetch(url, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro de rede' }));
    throw new ApiError(response.status, error.message || `Erro ${response.status}`, error.detail);
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

export async function exportTermPdf(id: string): Promise<Blob> {
  const url = `${API_BASE}/terms/${id}/export/pdf`;
  const response = await fetch(url);
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar PDF');
  return response.blob();
}

// --- Upload ---

export async function uploadDocument(file: File): Promise<{ term: TermResponse; analysis: AnalysisResponse }> {
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/upload`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro no upload' }));
    throw new ApiError(response.status, error.message, error.detail);
  }
  return response.json();
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
    const error = await response.json().catch(() => ({ message: 'Erro de rede' }));
    throw new ApiError(response.status, error.message || `Erro ${response.status}`, error.detail);
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
