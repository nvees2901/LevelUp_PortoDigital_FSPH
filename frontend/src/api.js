/**
 * api.js — Camada de integração frontend ↔ backend COLIC/FSPH
 * Substitui todos os dados mock por chamadas reais à API FastAPI.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API      = `${BASE_URL}/api/v1`;

// ── Token JWT (armazenado em memória — não localStorage) ──────────────────────
let _token = null;

export const setToken  = (t) => { _token = t; };
export const getToken  = ()  => _token;
export const clearToken = () => { _token = null; };

// ── Helper de request ─────────────────────────────────────────────────────────
async function req(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Erro na requisição');
  }
  if (res.status === 204) return null;
  return res.json();
}


// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Login — retorna { access_token, usuario }
 */
export async function login(matricula, senha, subunidade = null) {
  const data = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ matricula, senha, subunidade }),
  });
  setToken(data.access_token);
  return data.usuario;
}

export function logout() {
  clearToken();
}


// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

export async function getDashboard() {
  return req('/processos/dashboard');
}


// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lista todos os processos com filtros opcionais.
 */
export async function getProcessos({ busca, status, modalidade } = {}) {
  const params = new URLSearchParams();
  if (busca)      params.set('busca', busca);
  if (status)     params.set('status_filter', status);
  if (modalidade) params.set('modalidade', modalidade);
  const qs = params.toString() ? `?${params}` : '';
  return req(`/processos/${qs}`);
}

/**
 * Busca um processo específico por ID.
 */
export async function getProcesso(id) {
  return req(`/processos/${id}`);
}

/**
 * Cria um novo processo (status inicial: Rascunho).
 */
export async function criarProcesso(body) {
  return req('/processos/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Avança ou devolve o fluxo de um processo.
 * acao: 'avancar' | 'devolver'
 */
export async function acaoFluxo(id, acao, observacao = null) {
  return req(`/processos/${id}/fluxo`, {
    method: 'POST',
    body: JSON.stringify({ acao, observacao }),
  });
}

/**
 * Histórico de tramitação de um processo.
 */
export async function getHistorico(id) {
  return req(`/processos/${id}/historico`);
}

/**
 * Base de termos já homologados (todos os setores têm acesso).
 */
export async function getBaseValidados() {
  return req('/processos/base-validados');
}


// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD DE DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Faz upload de um arquivo para um processo e recebe a análise IA.
 * Retorna AnaliseOut { score, aprovados, alertas, reprovados, resumo }
 */
export async function uploadAnexo(processoId, file) {
  const formData = new FormData();
  formData.append('arquivo', file);

  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${API}/processos/${processoId}/anexos`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Erro no upload');
  }
  return res.json();
}

/**
 * Cria processo e faz upload dos arquivos em sequência.
 * Retorna { processo, analise }
 */
export async function criarProcessoComAnexos(dadosProcesso, arquivos) {
  const processo = await criarProcesso(dadosProcesso);

  let analise = null;
  for (const arquivo of arquivos) {
    analise = await uploadAnexo(processo.id, arquivo);
  }

  return { processo, analise };
}


// ═══════════════════════════════════════════════════════════════════════════════
// CHAT IA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Envia histórico de mensagens e recebe resposta da IA.
 * mensagens: [{ role: 'user'|'assistant', content: string }]
 * Retorna { resposta, referencias }
 */
export async function chatIA(mensagens, processoId = null) {
  return req('/chat/', {
    method: 'POST',
    body: JSON.stringify({
      mensagens,
      processo_id: processoId,
    }),
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS DE FORMATAÇÃO (mantém compatibilidade com o App.jsx existente)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converte ProcessoOut da API para o formato usado no App.jsx.
 */
export function normalizeProcesso(p) {
  return {
    id:         p.numero,          // App.jsx usa 'id' como string (ex: TR-2025-001)
    _uuid:      p.id,              // UUID real para chamadas de API
    objeto:     p.objeto,
    unidade:    p.unidade,
    autor:      p.autor,
    data:       p.data,
    status:     p.status,
    valor:      p.valor || 'A definir',
    modalidade: p.modalidade,
    scoreIA:    p.score_ia ? Math.round(p.score_ia) : null,
    checklist:  p.checklist || {},
    anexos:     p.anexos || [],
  };
}

export function normalizeProcessos(lista) {
  return lista.map(normalizeProcesso);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO PDF / DOCX
// ═══════════════════════════════════════════════════════════════════════════════

export async function exportarPDF(processoUUID) {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${API}/exportar/${processoUUID}/pdf`, { headers });
  if (!res.ok) throw new Error('Erro ao gerar PDF');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `processo_${processoUUID}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportarDOCX(processoUUID) {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${API}/exportar/${processoUUID}/docx`, { headers });
  if (!res.ok) throw new Error('Erro ao gerar DOCX');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `processo_${processoUUID}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANÁLISE IA DEDICADA
// ═══════════════════════════════════════════════════════════════════════════════
export async function analisarProcessoIA(processoUUID) {
  return req(`/processos/${processoUUID}/analisar`, { method: 'POST' });
}

export async function salvarCorrecoes(processoUUID, correcoes) {
  return req(`/processos/${processoUUID}/correcoes`, {
    method: 'POST',
    body: JSON.stringify(correcoes),
  });
}
