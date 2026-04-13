import {
  FileText, PieChart, Users, ShieldCheck, FileCheck,
} from 'lucide-react';
import type { Setor, FluxoConfig, TermoMock } from './types';

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

export const DADOS_INICIAIS: TermoMock[] = [
  { id: 'TR-2023-001', objeto: 'Aquisição de Equipamentos de EPI', autor: 'Douglas (Almoxarifado)', data: '20/10/2023', status: 'Aguardando Jurídico', valor: 'R$ 150.000,00', scoreIA: 92 },
  { id: 'TR-2023-002', objeto: 'Contratação de Empresa de Limpeza', autor: 'Maria (Manutenção)', data: '21/10/2023', status: 'Aguardando Diretoria', valor: 'R$ 850.000,00', scoreIA: 88 },
  { id: 'TR-2023-003', objeto: 'Serviço de Manutenção de Ar Condicionado', autor: 'João (Infraestrutura)', data: '22/10/2023', status: 'Aguardando Contratos', valor: 'R$ 85.000,00', scoreIA: 95 },
  { id: 'TR-2023-004', objeto: 'Compra de Insumos Laboratoriais', autor: 'Douglas (Almoxarifado)', data: '24/10/2023', status: 'Rascunho', valor: 'R$ 320.000,00', scoreIA: null },
  { id: 'TR-2023-005', objeto: 'Renovação Licenças de Software', autor: 'TI', data: '15/10/2023', status: 'Retorno Contratos (Final)', valor: 'R$ 45.000,00', scoreIA: 100 },
];
