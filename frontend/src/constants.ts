import {
  FileText, PieChart, Users, ShieldCheck, FileCheck, Activity,
} from 'lucide-react';
import type { Setor, FluxoConfig, TermoMock } from './types';

export const COLORS = {
  primary: '#0a2f64',
  primaryHover: '#134084',
  accent: '#1a5cb0',
} as const;

export const SUBUNIDADES = [
  'HEMOSE – Hemocentro de Sergipe',
  'LACEN – Lab. Central de Sergipe',
  'SVO – Serviço de Verificação de Óbitos',
  'Área Administrativa',
];

export const SETORES: Setor[] = [
  { id: 'demandante', nome: 'Área Demandante',     icon: Users,       descricao: 'HEMOSE / LACEN / SVO / Administrativo' },
  { id: 'dirop',      nome: 'DIROP',               icon: Activity,    descricao: 'Diretoria Operacional' },
  { id: 'diraf',      nome: 'DIRAF',               icon: PieChart,    descricao: 'Diretoria Administrativa-Financeira' },
  { id: 'diger',      nome: 'DIGER',               icon: ShieldCheck, descricao: 'Diretoria Geral – Autorização' },
  { id: 'colic',      nome: 'COLIC',               icon: FileText,    descricao: 'Coord. de Licitações e Contratos' },
  { id: 'juridico',   nome: 'Assessoria Jurídica', icon: FileCheck,   descricao: 'Análise jurídica e pareceres' },
];

export const FLUXO: Record<string, FluxoConfig> = {
  'Rascunho':              { proximo: 'Aguardando DIROP',        ator: 'demandante', acao: 'Enviar para DIROP' },
  'Aguardando DIROP':      { proximo: 'Aguardando DIRAF',        ator: 'dirop',      acao: 'Aprovar – Enviar p/ DIRAF' },
  'Aguardando DIRAF':      { proximo: 'Aguardando DIGER',        ator: 'diraf',      acao: 'Aprovar – Enviar p/ DIGER' },
  'Aguardando DIGER':      { proximo: 'Instrução COLIC',         ator: 'diger',      acao: 'Autorizar – Enviar p/ COLIC' },
  'Instrução COLIC':       { proximo: 'Aguardando Jurídico',     ator: 'colic',      acao: 'Instruir – Enviar p/ Jurídico' },
  'Aguardando Jurídico':   { proximo: 'Aprovação DIRAF/DIGER',   ator: 'juridico',   acao: 'Emitir Parecer Favorável' },
  'Aprovação DIRAF/DIGER': { proximo: 'Homologado',              ator: 'diraf',      acao: 'Homologar Contratação' },
  'Homologado':            { proximo: null,                       ator: null,         acao: null },
};

export const ETAPAS = Object.keys(FLUXO);

export const CHECKLIST = [
  { id: 'dfd',        label: 'DFD – Documento de Formalização da Demanda' },
  { id: 'etp',        label: 'ETP – Estudo Técnico Preliminar' },
  { id: 'tr',         label: 'Termo de Referência' },
  { id: 'dotacao',    label: 'Declaração de Dotação Orçamentária' },
  { id: 'auth_dirop', label: 'Autorização DIROP' },
  { id: 'auth_diraf', label: 'Autorização DIRAF' },
  { id: 'auth_diger', label: 'Autorização DIGER' },
];

export function statusColor(s: string): string {
  if (s === 'Rascunho')              return 'bg-slate-100 text-slate-600 border-slate-200';
  if (s === 'Homologado')            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'Instrução COLIC')       return 'bg-violet-50 text-violet-700 border-violet-200';
  if (s === 'Aprovação DIRAF/DIGER') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export function modalColor(m: string): string {
  // Legacy modal values
  if (m === 'Licitação')      return 'bg-blue-100 text-blue-800';
  if (m === 'Dispensa')       return 'bg-orange-100 text-orange-800';
  if (m === 'Inexigibilidade') return 'bg-emerald-100 text-emerald-800';
  // API category values
  if (m === 'capacitacao')    return 'bg-violet-100 text-violet-800';
  if (m === 'aquisicao')      return 'bg-blue-100 text-blue-800';
  if (m === 'servico_tecnico') return 'bg-orange-100 text-orange-800';
  if (m === 'outro')          return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

export const DADOS_INICIAIS: TermoMock[] = [
  {
    id: 'TR-2025-001', objeto: 'Aquisição de Reagentes e Insumos para LACEN',
    unidade: 'LACEN – Lab. Central de Sergipe', autor: 'Ana Lima', data: '10/01/2025',
    status: 'Aguardando Jurídico', valor: 'R$ 350.000,00', modalidade: 'Licitação', scoreIA: 92,
    checklist: { dfd: true, etp: true, tr: true, dotacao: true, auth_dirop: true, auth_diraf: true, auth_diger: false },
  },
  {
    id: 'TR-2025-002', objeto: 'Contratação de Serviços de Limpeza e Conservação',
    unidade: 'HEMOSE – Hemocentro de Sergipe', autor: 'Carlos Melo', data: '15/01/2025',
    status: 'Aguardando DIRAF', valor: 'R$ 850.000,00', modalidade: 'Licitação', scoreIA: 88,
    checklist: { dfd: true, etp: true, tr: true, dotacao: true, auth_dirop: true, auth_diraf: false, auth_diger: false },
  },
  {
    id: 'TR-2025-003', objeto: 'Manutenção Preventiva de Equipamentos do SVO',
    unidade: 'SVO – Serviço de Verificação de Óbitos', autor: 'Fernanda Reis', data: '18/01/2025',
    status: 'Instrução COLIC', valor: 'R$ 85.000,00', modalidade: 'Dispensa', scoreIA: 95,
    checklist: { dfd: true, etp: true, tr: true, dotacao: true, auth_dirop: true, auth_diraf: true, auth_diger: true },
  },
  {
    id: 'TR-2025-004', objeto: 'Software de Gestão Hospitalar – Licença Exclusiva',
    unidade: 'Área Administrativa', autor: 'Pedro Costa', data: '20/01/2025',
    status: 'Rascunho', valor: 'R$ 120.000,00', modalidade: 'Inexigibilidade', scoreIA: null,
    checklist: { dfd: false, etp: false, tr: false, dotacao: false, auth_dirop: false, auth_diraf: false, auth_diger: false },
  },
  {
    id: 'TR-2025-005', objeto: 'Renovação de Licenças Microsoft 365',
    unidade: 'Área Administrativa', autor: 'Marcos TI', data: '05/01/2025',
    status: 'Homologado', valor: 'R$ 45.000,00', modalidade: 'Inexigibilidade', scoreIA: 100,
    checklist: { dfd: true, etp: true, tr: true, dotacao: true, auth_dirop: true, auth_diraf: true, auth_diger: true },
  },
];
