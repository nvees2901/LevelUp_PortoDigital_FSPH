import type { ComponentType } from 'react';

// Workflow types
export type SetorId = 'demandante' | 'dirop' | 'diraf' | 'diger' | 'colic' | 'juridico';

export interface Setor {
  id: SetorId;
  nome: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  descricao: string;
}

export interface FluxoConfig {
  proximo: string | null;
  ator: SetorId | null;
  acao: string | null;
}

export interface UsuarioAtual {
  id: SetorId;
  nome: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  descricao: string;
  nomeUsuarioLogado: string;
  subunidade?: string;
  is_admin?: boolean;
}

// Auth — espelha os schemas Pydantic do backend
export interface UserOut {
  id: string;
  matricula: string;
  nome: string;
  setor_id: SetorId;
  subunidade: string | null;
  is_admin: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

// COLIC workflow status
export type TermStatus =
  | 'Rascunho'
  | 'Aguardando DIROP'
  | 'Aguardando DIRAF'
  | 'Aguardando DIGER'
  | 'Instrução COLIC'
  | 'Aguardando Jurídico'
  | 'Aprovação DIRAF/DIGER'
  | 'Homologado';

// Mock process type (matches original App.jsx)
/** @deprecated Will be removed after all components migrate to TermResponse */
export interface TermoMock {
  id: string;
  objeto: string;
  unidade: string;
  autor: string;
  data: string;
  status: string;
  valor: string;
  modalidade: string;
  scoreIA: number | null;
  checklist: Record<string, boolean>;
  _uuid?: string;
}

// Backend API types (matching Pydantic schemas)
export interface TermResponse {
  id: string;
  title: string;
  category: 'capacitacao' | 'aquisicao' | 'servico_tecnico' | 'outro';
  status: TermStatus;
  setor_atual: SetorId;
  content: string | null;
  sections: Record<string, unknown> | null;
  variable_fields: string[] | null;
  estimated_value: number | null;
  original_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermSummary {
  id: string;
  title: string;
  category: string;
  status: TermStatus;
  setor_atual: SetorId;
  estimated_value: number | null;
  original_filename: string | null;
  created_at: string;
}

export interface TermListResponse {
  items: TermSummary[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface TermCreate {
  title: string;
  category?: string;
  content?: string;
  estimated_value?: number;
}

export interface TermUpdate {
  title?: string;
  category?: string;
  status?: string;
  content?: string;
  estimated_value?: number;
}

// Analysis types (Lei 14.133/2021 compliance)
export interface CriterionResult {
  criterio: string;
  artigo: string;
  descricao: string;
  status: 'aprovado' | 'alerta' | 'reprovado';
  score: number;
  sugestao: string | null;
}

export interface Suggestion {
  prioridade: number;
  criterio: string;
  artigo: string;
  descricao: string;
}

export interface AnalysisResponse {
  id: string;
  term_id: string;
  compliance_score: number;
  status: 'aprovado' | 'alerta' | 'reprovado';
  criteria_results: CriterionResult[];
  suggestions: Suggestion[];
  legal_references: string[];
  created_at: string;
}

// Chat types
export type ChatMode = 'gerar' | 'analisar' | 'consultar';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  mode: ChatMode;
  session_id?: string;
  term_id?: string;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  mode: string;
  generated_term_id: string | null;
}

export interface ChatSessionResponse {
  id: string;
  mode: string;
  messages: ChatMessage[];
  generated_term_id: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionSummary {
  id: string;
  mode: string;
  title: string | null;
  message_count: number;
  generated_term_id: string | null;
  term_id: string | null;
  updated_at: string;
}

export interface ChatSessionListResponse {
  items: ChatSessionSummary[];
}

// Dashboard types (matches GET /api/v1/dashboard/stats)
export interface DashboardStats {
  total: number;
  por_status: Record<string, number>;
  conformidade_media: number;
  recent_terms: TermSummary[];
}

// Admin: Context Documents
export interface ContextDocument {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_id: string;
  uploaded_at: string;
  indexed_at: string | null;
  status: 'pending' | 'indexed' | 'failed';
  chunks_count: number | null;
  error_message: string | null;
}

export interface ContextDocumentList {
  items: ContextDocument[];
  total: number;
}

export interface TermChecklistOut {
  term_id: string;
  dfd: boolean;
  etp: boolean;
  tr: boolean;
  dotacao: boolean;
  auth_dirop: boolean;
  auth_diraf: boolean;
  auth_diger: boolean;
}

export interface WorkflowEventOut {
  id: string;
  term_id: string;
  ator_nome: string | null;
  de_setor: string | null;
  para_setor: string | null;
  acao: string;
  observacao: string | null;
  created_at: string;
}

// Navigation
export type TelaId = 'dashboard' | 'lista' | 'detalhe' | 'chat' | 'base' | 'analise' | 'admin';

export interface MensagemChat {
  de: 'ia' | 'user';
  texto: string;
}
