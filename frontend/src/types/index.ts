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
}

// Auth — espelha os schemas Pydantic do backend
export interface UserOut {
  id: string;
  matricula: string;
  nome: string;
  setor_id: SetorId;
  subunidade: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

// Mock process type (matches original App.jsx)
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
  status: 'rascunho' | 'em_analise' | 'validado' | 'reprovado';
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
  status: string;
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
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  mode: 'gerar' | 'analisar' | 'consultar';
  session_id?: string;
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

// Dashboard types (matches GET /api/v1/dashboard/stats)
export interface DashboardStats {
  total: number;
  validados: number;
  em_analise: number;
  rascunhos: number;
  reprovados: number;
  conformidade_media: number;
  recent_terms: TermSummary[];
}

// Navigation
export type TelaId = 'dashboard' | 'lista' | 'detalhe' | 'chat' | 'anexar' | 'base' | 'analise';

export interface MensagemChat {
  de: 'ia' | 'user';
  texto: string;
  isArquivo?: boolean;
  isAnalise?: boolean;
  isConclusao?: boolean;
  trId?: string;
}
