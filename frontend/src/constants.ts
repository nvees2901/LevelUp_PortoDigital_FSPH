import {
  FileText, PieChart, Users, ShieldCheck, FileCheck,
} from 'lucide-react';
import type { Setor, FluxoConfig } from './types';

export const COLORS = {
  primary: '#0a2f64',
  primaryHover: '#134084',
} as const;

export const SETORES: Setor[] = [
  { id: 'demandante', nome: 'Área Demandante', icon: Users },
  { id: 'diretoria', nome: 'Diretoria (Superior)', icon: PieChart },
  { id: 'contratos', nome: 'Setor de Contratos', icon: FileText },
  { id: 'controle', nome: 'Controle Interno', icon: ShieldCheck },
  { id: 'juridico', nome: 'Assessoria Jurídica', icon: FileCheck },
  { id: 'financeiro', nome: 'Setor Financeiro', icon: PieChart },
];

export const FLUXO: Record<string, FluxoConfig> = {
  'Rascunho': { proximo: 'Aguardando Diretoria', ator: 'demandante', acao: 'Enviar para Diretoria' },
  'Aguardando Diretoria': { proximo: 'Aguardando Contratos', ator: 'diretoria', acao: 'Aprovar e Enviar p/ Contratos' },
  'Aguardando Contratos': { proximo: 'Aguardando Controle Interno', ator: 'contratos', acao: 'Aprovar e Enviar p/ Controle Interno' },
  'Aguardando Controle Interno': { proximo: 'Aguardando Jurídico', ator: 'controle', acao: 'Aprovar e Enviar p/ Jurídico' },
  'Aguardando Jurídico': { proximo: 'Aguardando Financeiro', ator: 'juridico', acao: 'Parecer Favorável - Enviar p/ Financeiro' },
  'Aguardando Financeiro': { proximo: 'Retorno Contratos (Final)', ator: 'financeiro', acao: 'Aprovar Dotação - Retornar p/ Contratos' },
  'Retorno Contratos (Final)': { proximo: 'Concluído (Pronto para Edital)', ator: 'contratos', acao: 'Finalizar TR e Preparar Edital' },
  'Concluído (Pronto para Edital)': { proximo: null, ator: null, acao: null },
};
