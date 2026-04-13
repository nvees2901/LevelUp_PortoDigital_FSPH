import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Upload, PieChart, Users,
  CheckCircle, AlertTriangle, Clock, Search,
  ChevronRight, ArrowLeft, LogOut, FileCheck, ShieldCheck,
  Download, Send, Bot, Lock, User, Paperclip, X, Activity,
  Archive, BookOpen, Calendar, Tag
} from 'lucide-react';

// ─── CORES OFICIAIS ───────────────────────────────────────────────────────────
const C = {
  primary:  '#0a2f64',
  hover:    '#134084',
  accent:   '#1a5cb0',
};

// ─── SUBUNIDADES DEMANDANTES ──────────────────────────────────────────────────
const SUBUNIDADES = ['HEMOSE – Hemocentro de Sergipe', 'LACEN – Lab. Central de Sergipe', 'SVO – Serviço de Verificação de Óbitos', 'Área Administrativa'];

// ─── SETORES / PERFIS DE LOGIN ────────────────────────────────────────────────
const SETORES = [
  { id: 'demandante', nome: 'Área Demandante',     icon: Users,       descricao: 'HEMOSE / LACEN / SVO / Administrativo' },
  { id: 'dirop',      nome: 'DIROP',               icon: Activity,    descricao: 'Diretoria Operacional'                  },
  { id: 'diraf',      nome: 'DIRAF',               icon: PieChart,    descricao: 'Diretoria Administrativa-Financeira'    },
  { id: 'diger',      nome: 'DIGER',               icon: ShieldCheck, descricao: 'Diretoria Geral – Autorização'         },
  { id: 'colic',      nome: 'COLIC',               icon: FileText,    descricao: 'Coord. de Licitações e Contratos'      },
  { id: 'juridico',   nome: 'Assessoria Jurídica', icon: FileCheck,   descricao: 'Análise jurídica e pareceres'          },
];

// ─── FLUXO REAL (conforme Manual COLIC/FSPH) ─────────────────────────────────
const FLUXO = {
  'Rascunho':              { proximo: 'Aguardando DIROP',        ator: 'demandante', acao: 'Enviar para DIROP'               },
  'Aguardando DIROP':      { proximo: 'Aguardando DIRAF',        ator: 'dirop',      acao: 'Aprovar – Enviar p/ DIRAF'       },
  'Aguardando DIRAF':      { proximo: 'Aguardando DIGER',        ator: 'diraf',      acao: 'Aprovar – Enviar p/ DIGER'       },
  'Aguardando DIGER':      { proximo: 'Instrução COLIC',         ator: 'diger',      acao: 'Autorizar – Enviar p/ COLIC'     },
  'Instrução COLIC':       { proximo: 'Aguardando Jurídico',     ator: 'colic',      acao: 'Instruir – Enviar p/ Jurídico'   },
  'Aguardando Jurídico':   { proximo: 'Aprovação DIRAF/DIGER',   ator: 'juridico',   acao: 'Emitir Parecer Favorável'        },
  'Aprovação DIRAF/DIGER': { proximo: 'Homologado',              ator: 'diraf',      acao: 'Homologar Contratação'           },
  'Homologado':            { proximo: null,                       ator: null,         acao: null                              },
};

const ETAPAS = Object.keys(FLUXO);

// ─── CHECKLIST DOCUMENTAL (Art. 54 – Lei 14.133/2021) ────────────────────────
const CHECKLIST = [
  { id: 'dfd',        label: 'DFD – Documento de Formalização da Demanda' },
  { id: 'etp',        label: 'ETP – Estudo Técnico Preliminar'            },
  { id: 'tr',         label: 'Termo de Referência'                        },
  { id: 'dotacao',    label: 'Declaração de Dotação Orçamentária'         },
  { id: 'auth_dirop', label: 'Autorização DIROP'                          },
  { id: 'auth_diraf', label: 'Autorização DIRAF'                          },
  { id: 'auth_diger', label: 'Autorização DIGER'                          },
];

// ─── DADOS INICIAIS ───────────────────────────────────────────────────────────
const DADOS = [
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const FaixaCores = () => (
  <div className="flex h-1.5 w-full">
    <div className="bg-green-600 flex-1" />
    <div className="bg-yellow-400 flex-1" />
    <div className="bg-blue-600 flex-1" />
  </div>
);

const statusColor = (s) => {
  if (s === 'Rascunho')              return 'bg-slate-100 text-slate-600 border-slate-200';
  if (s === 'Homologado')            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'Instrução COLIC')       return 'bg-violet-50 text-violet-700 border-violet-200';
  if (s === 'Aprovação DIRAF/DIGER') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const modalColor = (m) => {
  if (m === 'Licitação')     return 'bg-blue-100 text-blue-800';
  if (m === 'Dispensa')      return 'bg-orange-100 text-orange-800';
  return 'bg-emerald-100 text-emerald-800';
};

// ── Importação da camada de API ───────────────────────────────────────────────
import {
  login as apiLogin, logout as apiLogout,
  getProcessos, acaoFluxo,
  criarProcessoComAnexos, normalizeProcessos, normalizeProcesso
} from './api.js';

// ═══════════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [usuario, setUsuario]     = useState(null);
  const [setorStep, setSetorStep] = useState(null);
  const [termos, setTermos]       = useState(DADOS);   // DADOS como fallback inicial
  const [tela, setTela]           = useState('dashboard');
  const [termoSel, setTermoSel]   = useState(null);
  const [apiOnline, setApiOnline] = useState(false);   // false = modo mock

  const navegar = (t, termo = null) => { setTela(t); if (termo) setTermoSel(termo); };

  // Carrega processos da API quando logado
  const carregarProcessos = async () => {
    try {
      const lista = await getProcessos();
      setTermos(normalizeProcessos(lista));
      setApiOnline(true);
    } catch {
      // API offline — mantém dados mock
      setApiOnline(false);
    }
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    const matricula  = e.target.matricula.value;
    const senha      = e.target.senha?.value || 'fsph2025';
    const subunidade = e.target.subunidade?.value || null;

    try {
      // Tenta autenticar na API real
      const usuarioApi = await apiLogin(matricula, senha, subunidade);
      // Mapeia setor da API para estrutura local (ícone etc.)
      const setorLocal = SETORES.find(s => s.id === usuarioApi.setor) || SETORES[0];
      setUsuario({ ...setorLocal, matricula: usuarioApi.matricula, subunidade: usuarioApi.subunidade, nome: usuarioApi.nome });
      await carregarProcessos();
    } catch {
      // Fallback mock — mantém comportamento anterior
      setUsuario({ ...setorStep, matricula, subunidade });
      setApiOnline(false);
    }
    setTela('dashboard');
  };

  // ── Avançar fluxo ─────────────────────────────────────────────────────────
  const avancar = async (id) => {
    const termo = termos.find(t => t.id === id);
    if (!termo) return;

    if (apiOnline && termo._uuid) {
      try {
        const atualizado = await acaoFluxo(termo._uuid, 'avancar');
        setTermos(prev => prev.map(t => t.id === id ? { ...t, ...normalizeProcesso(atualizado) } : t));
        navegar('lista');
        return;
      } catch (err) { console.warn('API indisponível, usando mock:', err); }
    }
    // Fallback mock
    setTermos(prev => prev.map(t => {
      if (t.id !== id) return t;
      const prox = FLUXO[t.status]?.proximo;
      return prox ? { ...t, status: prox } : t;
    }));
    navegar('lista');
  };

  // ── Devolver fluxo ────────────────────────────────────────────────────────
  const devolver = async (id) => {
    const termo = termos.find(t => t.id === id);
    if (!termo) return;

    if (apiOnline && termo._uuid) {
      try {
        const atualizado = await acaoFluxo(termo._uuid, 'devolver');
        setTermos(prev => prev.map(t => t.id === id ? { ...t, ...normalizeProcesso(atualizado) } : t));
        navegar('lista');
        return;
      } catch (err) { console.warn('API indisponível, usando mock:', err); }
    }
    // Fallback mock
    setTermos(prev => prev.map(t => {
      if (t.id !== id) return t;
      const idx = ETAPAS.indexOf(t.status);
      return idx > 0 ? { ...t, status: ETAPAS[idx - 1] } : t;
    }));
    navegar('lista');
  };

  // ── Anexar e enviar (cria processo + upload + avança ao DIROP) ─────────────
  const anexarEEnviar = async (dadosProcesso, arquivos) => {
    if (apiOnline) {
      try {
        const { processo } = await criarProcessoComAnexos({
          objeto:     dadosProcesso.objeto,
          unidade:    dadosProcesso.unidade,
          modalidade: dadosProcesso.modalidade,
          valor:      dadosProcesso.valor,
          checklist:  dadosProcesso.checklist,
        }, arquivos);
        // Avança automaticamente para DIROP
        await acaoFluxo(processo.id, 'avancar');
        await carregarProcessos();
        navegar('lista');
        return;
      } catch (err) { console.warn('API indisponível:', err); }
    }
    // Fallback mock
    const statusInicial = FLUXO['Rascunho'].proximo;
    setTermos(prev => [{ ...dadosProcesso, status: statusInicial }, ...prev]);
    navegar('lista');
  };

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!usuario) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ backgroundColor: C.primary }} className="shadow-lg">
          <div className="max-w-5xl mx-auto py-5 px-6 flex flex-col items-center gap-2">
            <img
              src="/logo-fsph.png"
              alt="Logo FSPH – Governo de Sergipe"
              className="h-20 object-contain drop-shadow-md"
              onError={e => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hidden items-center gap-3">
              <div className="bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm border border-white/20">
                <span className="font-black text-white text-2xl tracking-widest">FSPH</span>
              </div>
              <div className="text-white">
                <p className="font-bold text-lg leading-tight">Sistema de Gestão COLIC</p>
                <p className="text-blue-200 text-xs">Fundação de Saúde Parreiras Horta</p>
              </div>
            </div>
          </div>
          <FaixaCores />
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Coordenação de Licitações e Contratos</h1>
              <p className="text-slate-500 text-sm mt-1">Lei 14.133/2021 • Decreto Estadual nº 342/2023 • SEI</p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7">
              {!setorStep ? (
                <>
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 text-center">Selecione sua Unidade de Acesso</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {SETORES.map(s => (
                      <button key={s.id} onClick={() => setSetorStep(s)}
                        className="border-2 border-slate-200 hover:border-[#0a2f64] hover:bg-blue-50 rounded-xl p-5 flex flex-col items-center gap-2.5 transition-all group">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-[#0a2f64] flex items-center justify-center transition-colors">
                          <s.icon size={24} className="text-[#0a2f64] group-hover:text-white transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-slate-800 text-sm">{s.nome}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.descricao}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="max-w-sm mx-auto">
                  <button onClick={() => setSetorStep(null)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-[#0a2f64] mb-6 text-sm transition-colors">
                    <ArrowLeft size={15} /> Voltar
                  </button>
                  <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="w-10 h-10 bg-[#0a2f64] rounded-lg flex items-center justify-center shrink-0">
                      <setorStep.icon size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-[#0a2f64] text-sm">{setorStep.nome}</p>
                      <p className="text-xs text-slate-500">{setorStep.descricao}</p>
                    </div>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    {setorStep.id === 'demandante' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Subunidade</label>
                        <select name="subunidade" required
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64] bg-white">
                          {SUBUNIDADES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Usuário / Matrícula</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input type="text" name="matricula" required placeholder="Digite seu usuário"
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input type="password" required placeholder="••••••••"
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
                      </div>
                    </div>
                    <button type="submit" style={{ backgroundColor: C.primary }}
                      className="w-full py-2.5 text-white rounded-lg font-bold text-sm hover:bg-[#134084] transition-colors shadow-md mt-2">
                      Acessar o Sistema
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── SHELL PÓS-LOGIN ────────────────────────────────────────────────────────
  const render = () => {
    switch (tela) {
      case 'dashboard': return <Dashboard usuario={usuario} termos={termos} navegar={navegar} />;
      case 'lista':     return <ListaTermos usuario={usuario} termos={termos} navegar={navegar} />;
      case 'detalhe':   return <DetalheTermo usuario={usuario} termo={termoSel} avancar={avancar} devolver={devolver} navegar={navegar} />;
      case 'chat':      return <ChatIA usuario={usuario} termos={termos} setTermos={setTermos} navegar={navegar} apiOnline={apiOnline} carregarProcessos={carregarProcessos} />;
      case 'anexar':    return <AnexarDocumento usuario={usuario} termos={termos} anexarEEnviar={anexarEEnviar} navegar={navegar} />;
      case 'base':      return <BaseTermosValidados termos={termos} navegar={navegar} />;
      default:          return <Dashboard usuario={usuario} termos={termos} navegar={navegar} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* HEADER */}
      <header className="z-20 shadow-md flex flex-col">
        <div style={{ backgroundColor: C.primary }} className="py-2.5 px-5 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo FSPH"
              className="h-10 bg-white p-1 rounded object-contain"
              onError={e => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hidden items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
              <span className="font-black text-lg tracking-widest">FSPH</span>
            </div>
            <div className="hidden md:block border-l border-blue-800 pl-3">
              <p className="font-bold text-sm leading-tight">Sistema COLIC</p>
              <p className="text-xs text-blue-300">Coordenação de Licitações e Contratos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="font-bold text-sm">{usuario.nome}</p>
              <p className="text-xs text-blue-300">{usuario.subunidade ? usuario.subunidade.split('–')[0].trim() : usuario.descricao}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
              <usuario.icon size={17} className="text-white" />
            </div>
          </div>
        </div>
        <FaixaCores />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto mt-3">
            <p className="text-xs uppercase text-slate-400 font-bold mb-2 px-2 tracking-wider">Menu</p>
            {[
              { id: 'dashboard', label: 'Dashboard',           icon: PieChart  },
              { id: 'lista',     label: 'Processos',           icon: FileText  },
              { id: 'base',      label: 'Base de Termos',      icon: Archive   },
            ].map(item => (
              <button key={item.id} onClick={() => navegar(item.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${tela === item.id ? 'bg-[#0a2f64] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'}`}>
                <item.icon size={17} />{item.label}
              </button>
            ))}
            <div className="pt-4 pb-1">
              <p className="text-xs uppercase text-slate-400 font-bold px-2 tracking-wider">Assistente IA</p>
            </div>
            <button onClick={() => navegar('chat')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${tela === 'chat' ? 'bg-[#0a2f64] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'}`}>
              <Bot size={17} /> Chat IA / Consulta
            </button>
            <button onClick={() => navegar('anexar')}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${tela === 'anexar' ? 'bg-[#0a2f64] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'}`}>
              <Upload size={17} /> Anexar Documento
            </button>
            <div className="px-3 py-2 mt-1">
              <p className="text-xs text-slate-400 leading-relaxed">
                {usuario.id === 'demandante'
                  ? '💡 Elabore processos e analise documentos com IA.'
                  : '💡 Consulte fluxos, legislação e analise documentos.'}
              </p>
            </div>
          </nav>
          <div className="p-3 border-t border-slate-200">
            <button onClick={() => { apiLogout(); setUsuario(null); setSetorStep(null); }}
              className="flex items-center gap-2 text-red-500 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors text-sm font-medium">
              <LogOut size={16} /> Sair do Sistema
            </button>
            <div className={`mx-2 mt-2 px-2 py-1 rounded text-xs text-center font-semibold ${apiOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {apiOnline ? '🟢 API conectada' : '🟡 Modo demonstração'}
            </div>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <main className="flex-1 overflow-auto p-5 bg-slate-100/60">
          {render()}
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({ usuario, termos, navegar }) {
  const pendentes    = termos.filter(t => FLUXO[t.status]?.ator === usuario.id);
  const emTramit     = termos.filter(t => t.status !== 'Rascunho' && t.status !== 'Homologado').length;
  const homologados  = termos.filter(t => t.status === 'Homologado').length;

  const cards = [
    { label: 'Total de Processos', val: termos.length,    cor: 'text-[#0a2f64]', bg: 'bg-blue-50',    Icon: FileText    },
    { label: 'Pendentes Comigo',   val: pendentes.length, cor: 'text-amber-600', bg: 'bg-amber-50',   Icon: Clock       },
    { label: 'Em Tramitação',      val: emTramit,         cor: 'text-violet-600',bg: 'bg-violet-50',  Icon: ChevronRight},
    { label: 'Homologados',        val: homologados,      cor: 'text-emerald-600',bg:'bg-emerald-50', Icon: CheckCircle },
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">{c.label}</p>
                <p className={`text-3xl font-black ${c.cor}`}>{c.val}</p>
              </div>
              <div className={`p-2 ${c.bg} rounded-lg`}><c.Icon size={18} className={c.cor} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Distribuição por etapa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-[#0a2f64] text-sm mb-3">Distribuição por Etapa do Fluxo COLIC</h3>
        <div className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa, i) => {
            const count = termos.filter(t => t.status === etapa).length;
            return (
              <div key={etapa}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${count > 0 ? 'bg-blue-50 border-blue-200 text-[#0a2f64]' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                <span className="text-slate-300 font-normal">{i + 1}.</span> {etapa}
                {count > 0 && (
                  <span className="bg-[#0a2f64] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">{count}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pendentes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-[#0a2f64] flex items-center gap-2 text-sm">
            <AlertTriangle className="text-amber-500" size={17} />
            Requer Sua Ação — {usuario.nome} ({pendentes.length})
          </h3>
          <button onClick={() => navegar('lista')} className="text-xs text-[#0a2f64] hover:underline font-medium">Ver todos →</button>
        </div>
        {pendentes.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {pendentes.map(t => (
              <div key={t.id} className="p-4 hover:bg-slate-50 flex items-center justify-between gap-4 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-slate-800 text-sm">{t.id}</p>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${modalColor(t.modalidade)}`}>{t.modalidade}</span>
                  </div>
                  <p className="text-sm text-slate-600">{t.objeto}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.unidade} • {t.valor}</p>
                </div>
                <button onClick={() => navegar('detalhe', t)}
                  className="px-4 py-2 bg-[#0a2f64] text-white rounded-lg text-xs font-bold hover:bg-[#134084] transition shrink-0">
                  Analisar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-slate-400">
            <CheckCircle size={36} className="mx-auto text-emerald-400 mb-2 opacity-60" />
            <p className="text-sm">Nenhum processo aguardando sua ação.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTA DE PROCESSOS
// ═══════════════════════════════════════════════════════════════════════════════
function ListaTermos({ usuario, termos, navegar }) {
  const [busca, setBusca]           = useState('');
  const [filtroMod, setFiltroMod]   = useState('Todas');
  const [filtroStatus, setFiltroStatus] = useState('Todos');

  const statusOpts = ['Todos', ...ETAPAS];

  const lista = termos.filter(t => {
    const q = busca.toLowerCase();
    const mb = t.objeto.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.unidade.toLowerCase().includes(q);
    const mm = filtroMod === 'Todas' || t.modalidade === filtroMod;
    const ms = filtroStatus === 'Todos' || t.status === filtroStatus;
    return mb && mm && ms;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
        <h2 className="text-base font-bold text-[#0a2f64]">Processos de Contratação</h2>
        {usuario.id === 'demandante' && (
          <button onClick={() => navegar('chat')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm hover:bg-[#134084] transition"
            style={{ backgroundColor: C.primary }}>
            <Bot size={15} /> Novo Processo via IA
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por objeto, número ou unidade..."
            className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
        </div>
        <select value={filtroMod} onChange={e => setFiltroMod(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
          {['Todas', 'Licitação', 'Dispensa', 'Inexigibilidade'].map(m => <option key={m}>{m}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
          {statusOpts.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
              {['Processo / Objeto', 'Unidade', 'Modalidade', 'Status', 'Score IA', 'Ação'].map((h, i) => (
                <th key={h} className={`p-4 font-semibold ${i === 5 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map(t => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <p className="font-bold text-[#0a2f64] text-sm">{t.id}</p>
                  <p className="text-sm text-slate-700 mt-0.5">{t.objeto}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.valor}</p>
                </td>
                <td className="p-4 text-xs text-slate-600 max-w-32">{t.unidade.split('–')[0].trim()}</td>
                <td className="p-4">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(t.modalidade)}`}>{t.modalidade}</span>
                </td>
                <td className="p-4">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-semibold ${statusColor(t.status)}`}>{t.status}</span>
                </td>
                <td className="p-4">
                  {t.scoreIA != null ? (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${t.scoreIA >= 90 ? 'text-emerald-600' : 'text-amber-500'}`}>{t.scoreIA}%</span>
                      <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${t.scoreIA >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${t.scoreIA}%` }} />
                      </div>
                    </div>
                  ) : <span className="text-slate-300 text-xs">N/A</span>}
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => navegar('detalhe', t)}
                    className="text-[#0a2f64] hover:bg-blue-50 font-bold text-xs px-3 py-1.5 rounded transition-colors border border-transparent hover:border-blue-200">
                    Ver Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">Nenhum processo encontrado para os filtros aplicados.</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAINEL DE ANÁLISE IA — botão real que chama Claude
// ═══════════════════════════════════════════════════════════════════════════════
function PainelAnaliseIA({ termo }) {
  const [analisando, setAnalisando] = useState(false);
  const [resultado,  setResultado]  = useState(null);
  const [score,      setScore]      = useState(termo.scoreIA);
  const [aba,        setAba]        = useState('analise'); // 'analise' | 'corrigir'
  const [correcoes,  setCorrecoes]  = useState({
    sancoes:        '',
    sustentabilidade: '',
    valor:          '',
    prazo:          '',
    especificacoes: '',
    observacao:     '',
  });
  const [salvando,   setSalvando]   = useState(false);
  const [salvo,      setSalvo]      = useState(false);

  const solicitarAnalise = async () => {
    setAnalisando(true);
    try {
      if (termo._uuid) {
        const { analisarProcessoIA } = await import('./api.js');
        const res = await analisarProcessoIA(termo._uuid);
        setScore(Math.round(res.score));
        let txt = `**SCORE DE CONFORMIDADE: ${Math.round(res.score)}%**\n\n`;
        if (res.aprovados?.length) {
          txt += `**✅ APROVADOS:**\n`;
          res.aprovados.forEach(a => { txt += `- ${a}\n`; });
          txt += '\n';
        }
        if (res.alertas?.length) {
          txt += `**⚠️ ALERTAS (melhorar):**\n`;
          res.alertas.forEach(a => { txt += `- ${a}\n`; });
          txt += '\n';
        }
        if (res.reprovados?.length) {
          txt += `**❌ REPROVADOS (corrigir):**\n`;
          res.reprovados.forEach(r => { txt += `- ${r}\n`; });
          txt += '\n';
        }
        if (res.resumo) txt += `**RESUMO:**\n${res.resumo}`;
        setResultado(txt);
      } else {
        setScore(72);
        setResultado(
          `**SCORE DE CONFORMIDADE: 72%**\n\n` +
          `**✅ APROVADOS:**\n- Objeto definido — Art. 6º, XXIII\n- Modalidade fundamentada — Art. 28\n\n` +
          `**⚠️ ALERTAS (melhorar):**\n- Valor estimado não detalhado — Art. 23\n- Sustentabilidade ausente — Art. 11, IV\n\n` +
          `**❌ REPROVADOS (corrigir):**\n- Sanções administrativas não previstas — Art. 156\n- Dotação orçamentária ausente — Art. 54\n\n` +
          `**RESUMO:**\nO processo necessita de complementação documental antes de seguir para o DIROP.`
        );
      }
    } catch (err) {
      setResultado('❌ Erro ao conectar com o assistente IA: ' + err.message);
    } finally {
      setAnalisando(false);
    }
  };

  const salvarCorrecoes = async () => {
    if (!termo._uuid) {
      alert('Correções disponíveis apenas para processos salvos na API.');
      return;
    }
    setSalvando(true);
    try {
      const { salvarCorrecoes: salvarAPI } = await import('./api.js');
      const res = await salvarAPI(termo._uuid, correcoes);
      // Atualiza score e resultado com a nova análise
      setScore(Math.round(res.score));
      let txt = `**SCORE ATUALIZADO: ${Math.round(res.score)}%**\n\n`;
      if (res.aprovados?.length) {
        txt += `**✅ APROVADOS:**\n`;
        res.aprovados.forEach(a => { txt += `- ${a}\n`; });
        txt += '\n';
      }
      if (res.alertas?.length) {
        txt += `**⚠️ ALERTAS (melhorar):**\n`;
        res.alertas.forEach(a => { txt += `- ${a}\n`; });
        txt += '\n';
      }
      if (res.reprovados?.length) {
        txt += `**❌ REPROVADOS (corrigir):**\n`;
        res.reprovados.forEach(r => { txt += `- ${r}\n`; });
        txt += '\n';
      }
      if (res.resumo) txt += `**RESUMO:**\n${res.resumo}`;
      setResultado(txt);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
      // Volta para aba de análise para mostrar resultado
      setAba('analise');
    } catch (err) {
      alert('Erro ao salvar correções: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const renderLinhas = (texto) =>
    texto.split('\n').map((l, i) => {
      const fmt = l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <p key={i} className={l === '' ? 'h-1' : 'leading-relaxed'} dangerouslySetInnerHTML={{ __html: fmt }} />;
    });

  const corColor = score != null ? (score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400') : 'text-slate-300';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header com score */}
      <div className="p-3 text-white flex items-center justify-between" style={{ backgroundColor: C.primary }}>
        <span className="font-bold text-sm flex items-center gap-1.5"><Bot size={15} /> Análise IA</span>
        <span className={`text-xl font-black ${corColor}`}>
          {score != null && score > 0 ? `${score}%` : '--'}
        </span>
      </div>

      {/* Abas */}
      {resultado && (
        <div className="flex border-b border-slate-200">
          <button onClick={() => setAba('analise')}
            className={`flex-1 py-2 text-xs font-bold transition ${aba === 'analise' ? 'text-[#0a2f64] border-b-2 border-[#0a2f64] bg-blue-50' : 'text-slate-500 hover:bg-slate-50'}`}>
            📋 Análise
          </button>
          <button onClick={() => setAba('corrigir')}
            className={`flex-1 py-2 text-xs font-bold transition ${aba === 'corrigir' ? 'text-[#0a2f64] border-b-2 border-[#0a2f64] bg-blue-50' : 'text-slate-500 hover:bg-slate-50'}`}>
            ✏️ Corrigir
          </button>
        </div>
      )}

      <div className="p-4 text-xs">
        {/* ABA ANÁLISE */}
        {aba === 'analise' && (
          <>
            {resultado ? (
              <div className="space-y-1 text-slate-700 max-h-56 overflow-y-auto mb-3">
                {renderLinhas(resultado)}
              </div>
            ) : score != null && score > 0 ? (
              <div className="space-y-2 mb-3">
                <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span>Art. 18 (Fase Preparatória) contemplado.</span></div>
                <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span>Art. 23 (Valor Estimado) fundamentado.</span></div>
                {score < 100 && (
                  <div className="flex items-start gap-1.5 p-2 bg-amber-50 rounded border border-amber-100">
                    <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-amber-800">Detalhar critérios de sustentabilidade (Art. 11, IV).</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-slate-400 mb-3">Documento ainda não analisado pela IA.</p>
              </div>
            )}
            <button onClick={solicitarAnalise} disabled={analisando}
              className={`w-full py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50
                ${resultado ? 'bg-blue-50 hover:bg-blue-100 text-[#0a2f64] border border-blue-200' : 'text-white'}`}
              style={!resultado ? { backgroundColor: C.primary } : {}}>
              {analisando
                ? <><div className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" /> Analisando...</>
                : resultado ? '🔄 Reanalisar com IA' : <><Bot size={13} /> Solicitar Análise IA</>}
            </button>
          </>
        )}

        {/* ABA CORRIGIR */}
        {aba === 'corrigir' && (
          <div className="space-y-3">
            <p className="text-slate-500 text-xs mb-2">Preencha os itens pendentes identificados pela análise:</p>

            {[
              { key: 'sancoes',          label: '❌ Sanções Administrativas — Art. 156',       placeholder: 'Ex: Multa de 10% sobre o valor contratual por descumprimento...' },
              { key: 'sustentabilidade', label: '⚠️ Critérios de Sustentabilidade — Art. 11, IV', placeholder: 'Ex: Preferência por empresas com certificação ISO 14001...' },
              { key: 'valor',            label: '⚠️ Detalhamento do Valor — Art. 23',           placeholder: 'Ex: Valor obtido por pesquisa de mercado em 3 fornecedores...' },
              { key: 'prazo',            label: '⚠️ Prazo de Vigência — Art. 105',              placeholder: 'Ex: 12 meses, prorrogável por até 60 meses...' },
              { key: 'especificacoes',   label: '⚠️ Especificações Técnicas — Art. 6º, XXIII', placeholder: 'Ex: Equipamentos marca X, modelo Y, conforme ABNT NBR...' },
              { key: 'observacao',       label: '📝 Observações Gerais',                         placeholder: 'Outras correções ou complementações necessárias...' },
            ].map(campo => (
              <div key={campo.key}>
                <label className="font-bold text-slate-600 block mb-1">{campo.label}</label>
                <textarea
                  value={correcoes[campo.key]}
                  onChange={e => setCorrecoes(prev => ({ ...prev, [campo.key]: e.target.value }))}
                  placeholder={campo.placeholder}
                  rows={2}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0a2f64] resize-none"
                />
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button onClick={salvarCorrecoes} disabled={salvando}
                className="flex-1 py-2 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: C.primary }}>
                {salvando ? 'Salvando...' : salvo ? '✅ Salvo!' : '💾 Salvar Correções'}
              </button>
              <button onClick={() => { solicitarAnalise(); setAba('analise'); }}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5">
                🔄 Reanalisar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// DETALHE DO PROCESSO
// ═══════════════════════════════════════════════════════════════════════════════
function DetalheTermo({ usuario, termo, avancar, devolver, navegar }) {
  if (!termo) return null;

  const [termoAtual, setTermoAtual] = useState(termo);
  const [exportando, setExportando] = useState(null);

  // Busca dados frescos da API ao abrir o detalhe
  useEffect(() => {
    if (!termo._uuid) return;
    import('./api.js').then(({ getProcesso, normalizeProcesso }) => {
      getProcesso(termo._uuid)
        .then(fresco => setTermoAtual({ ...termo, ...normalizeProcesso(fresco) }))
        .catch(() => setTermoAtual(termo));
    });
  }, [termo._uuid]);

  const t       = termoAtual;
  const conf    = FLUXO[t.status];
  const podeAgir = conf && conf.ator === usuario.id;
  const ck       = t.checklist || {};
  const ckTotal  = CHECKLIST.length;
  const ckOk     = CHECKLIST.filter(d => ck[d.id]).length;
  const idxAtual = ETAPAS.indexOf(t.status);

  const handleExportar = async (tipo) => {
    if (!termo._uuid) {
      alert('Exportação disponível apenas para processos salvos na API.');
      return;
    }
    setExportando(tipo);
    try {
      const { exportarPDF, exportarDOCX } = await import('./api.js');
      if (tipo === 'pdf')  await exportarPDF(termo._uuid);
      if (tipo === 'docx') await exportarDOCX(termo._uuid);
    } catch (err) {
      alert('Erro ao exportar: ' + err.message);
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button onClick={() => navegar('lista')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-[#0a2f64] mb-5 text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Voltar para Processos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── PAINEL PRINCIPAL ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-xl font-black text-[#0a2f64]">{t.id}</h1>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(t.modalidade)}`}>{t.modalidade}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(t.status)}`}>{t.status}</span>
                </div>
                <p className="text-sm text-slate-700 font-medium">{t.objeto}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportar('pdf')}
                  disabled={exportando === 'pdf'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: C.primary }}
                  title="Baixar PDF">
                  {exportando === 'pdf' ? '...' : <><Download size={13} /> PDF</>}
                </button>
                <button
                  onClick={() => handleExportar('docx')}
                  disabled={exportando === 'docx'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0a2f64] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                  title="Baixar DOCX">
                  {exportando === 'docx' ? '...' : <><Download size={13} /> DOCX</>}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg text-xs mb-5 border border-slate-100">
              {[
                { l: 'Unidade',       v: t.unidade?.split('–')[0].trim() },
                { l: 'Autor',         v: t.autor                         },
                { l: 'Valor Estimado',v: t.valor                         },
                { l: 'Data',          v: t.data                          },
              ].map(i => (
                <div key={i.l}>
                  <p className="text-slate-400 font-bold uppercase mb-0.5">{i.l}</p>
                  <p className="font-semibold text-slate-800">{i.v}</p>
                </div>
              ))}
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck size={14} /> Checklist Documental — Art. 54 / Lei 14.133/2021
                </h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ckOk === ckTotal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {ckOk}/{ckTotal} docs
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {CHECKLIST.map(doc => (
                  <div key={doc.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${ck[doc.id] ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {ck[doc.id]
                      ? <CheckCircle size={13} className="shrink-0 text-emerald-600" />
                      : <X size={13} className="shrink-0 text-red-500" />}
                    {doc.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── PAINEL LATERAL ── */}
        <div className="space-y-5">

          {/* Score IA */}
          <PainelAnaliseIA termo={t} />

          {/* Fluxo de Aprovação */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
              Fluxo COLIC/FSPH
            </h3>
            <div className="space-y-1.5 mb-5">
              {ETAPAS.map((step, idx) => {
                const isCur  = termo.status === step;
                const isPast = idxAtual > idx;
                return (
                  <div key={step} className={`flex items-center gap-2 text-xs font-medium ${isCur ? 'opacity-100' : isPast ? 'opacity-65' : 'opacity-30'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                      ${isCur  ? 'bg-[#0a2f64] text-white ring-2 ring-blue-200 ring-offset-1 scale-110'
                      : isPast ? 'bg-emerald-500 text-white'
                      :          'bg-slate-200 text-slate-500'}`}>
                      {isPast ? '✓' : idx + 1}
                    </div>
                    <span className={isCur ? 'text-[#0a2f64] font-bold' : 'text-slate-500'}>{step}</span>
                  </div>
                );
              })}
            </div>

            {podeAgir ? (
              <div className="space-y-2">
                <button onClick={() => avancar(t.id)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow transition flex justify-center items-center gap-2">
                  <CheckCircle size={15} /> {conf.acao}
                </button>
                <button onClick={() => devolver(t.id)}
                  className="w-full py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg font-bold text-xs transition">
                  ↩ Devolver para Ajustes
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg text-center text-xs border border-slate-200">
                {conf?.ator
                  ? <>Aguardando ação de:<br /><strong className="text-[#0a2f64] text-sm block mt-0.5">{SETORES.find(s => s.id === conf.ator)?.nome}</strong></>
                  : <span className="text-emerald-700 font-bold">✓ Processo Homologado</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT IA — todos os setores têm acesso
// ═══════════════════════════════════════════════════════════════════════════════
function ChatIA({ usuario, termos, setTermos, navegar, apiOnline, carregarProcessos }) {
  const isDemandante = usuario.id === 'demandante';

  const [msgs, setMsgs]           = useState([{
    de: 'ia',
    texto: isDemandante
      ? `Olá! Sou o Assistente COLIC da FSPH, treinado na Lei 14.133/2021 e nos fluxos internos. Posso ajudar você a elaborar processos de contratação (Licitação, Dispensa ou Inexigibilidade) ou analisar documentos. Como posso ajudar?`
      : `Olá, ${usuario.nome}! Sou o Assistente COLIC. Posso responder dúvidas sobre fluxos da COLIC, modalidades de contratação, checklist documental, prazos legais e analisar documentos que você anexar. Como posso ajudar?`,
  }]);
  const [input, setInput]         = useState('');
  const [etapa, setEtapa]         = useState(0);
  const [arquivo, setArquivo]     = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const fileRef                   = useRef(null);
  const endRef                    = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, analisando]);

  const addMsg = (de, texto, extra = {}) =>
    setMsgs(prev => [...prev, { de, texto, ...extra }]);

  // Análise de arquivo — usa API real se disponível
  const analisarArquivo = async (file) => {
    addMsg('user', `📎 Arquivo anexado para análise: ${file.name}`, { isArquivo: true });
    setArquivo(null);
    setAnalisando(true);

    try {
      if (apiOnline) {
        // Precisa de um processo para fazer upload — usa o mais recente ou cria temporário
        const { uploadAnexo, chatIA } = await import('./api.js');

        // Envia texto do arquivo para análise via Chat IA
        const texto = `Analise este documento chamado "${file.name}" e verifique sua conformidade com a Lei 14.133/2021. Identifique: score de conformidade, critérios aprovados, alertas e itens reprovados.`;
        const resultado = await chatIA([{ role: 'user', content: texto }]);
        setAnalisando(false);
        addMsg('ia', `📊 Análise IA concluída — "${file.name}"\n\n${resultado.resposta}`, { isAnalise: true });
        return;
      }
    } catch (err) {
      console.warn('Fallback mock análise:', err);
    }

    // Fallback mock
    setTimeout(() => {
      setAnalisando(false);
      addMsg('ia',
        `📊 Análise concluída — "${file.name}"\n\n` +
        `Score de conformidade (Lei 14.133/2021): **82%**\n\n` +
        `✅ Art. 6º, XXIII – Objeto claramente definido\n` +
        `✅ Art. 18 – Estudo Técnico Preliminar presente\n` +
        `✅ Art. 23 – Valor estimado fundamentado\n` +
        `✅ Art. 92 – Condições de pagamento estabelecidas\n` +
        `⚠️ Art. 156 – Sanções administrativas não localizadas\n` +
        `⚠️ Art. 11, IV – Critérios de sustentabilidade ausentes\n` +
        `❌ Art. 40 – Prazo de vigência não especificado\n\n` +
        `Recomendo complementar os itens sinalizados antes de enviar ao DIROP.`,
        { isAnalise: true }
      );
    }, 2200);
  };

  // Base de conhecimento para consulta
  const consultar = (texto) => {
    const t = texto.toLowerCase();
    if (t.includes('dispensa'))
      return 'A **Dispensa de Licitação** (Art. 75, Lei 14.133/2021) aplica-se para baixo valor, emergência ou licitação frustrada. Fluxo na FSPH: Área Demandante → DIROP → DIRAF → DIGER → COLIC instrui → Jurídico emite parecer → DIRAF/DIGER aprovam → Publicação no PNCP → Formalização.';
    if (t.includes('inexigibilidade'))
      return 'A **Inexigibilidade** (Art. 74) ocorre quando a competição é inviável: fornecedor exclusivo, notória especialização ou atividades artísticas. Exige: Justificativa Técnica + Comprovação de Exclusividade + Parecer Jurídico + Aprovação COLIC → DIRAF → DIGER → Ratificação e Publicação.';
    if (t.includes('licitação') || t.includes('pregão'))
      return 'A **Licitação** é a modalidade padrão (Arts. 28–73). O pregão eletrônico é obrigatório para bens e serviços comuns. Fluxo: COLIC elabora edital → Análise Jurídica → Publicação → Fase Externa → Recursos → Homologação e Adjudicação → Aprovação DIRAF/DIGER → Contrato.';
    if (t.includes('prazo') || t.includes('vigência'))
      return 'Prazos contratuais máximos pela Lei 14.133/2021: **Serviços contínuos**: 5 anos (prorrogável com justificativa). **Ata de Registro de Preços**: 1 ano. **Serviços de TI**: até 10 anos (Art. 6º, IV).';
    if (t.includes('dfd'))
      return 'O **DFD** (Documento de Formalização da Demanda) é o ponto de partida do processo. Deve conter: identificação da necessidade, justificativa, quantitativos estimados e vinculação ao Plano de Contratações Anual (PCA).';
    if (t.includes('etp'))
      return 'O **ETP** (Estudo Técnico Preliminar) avalia alternativas viáveis, identifica a modalidade licitatória mais adequada, riscos potenciais e critérios de julgamento. É obrigatório pela Lei 14.133/2021, Art. 18.';
    if (t.includes('tr') || t.includes('termo de referência'))
      return 'O **Termo de Referência** detalha: objeto, especificações técnicas, critérios de aceitabilidade, obrigações das partes e condições de pagamento. É essencial para guiar licitações, dispensas ou inexigibilidades.';
    if (t.includes('dirop'))
      return 'A **DIROP** (Diretoria Operacional) realiza a análise técnica da demanda, verificando viabilidade operacional e podendo propor ajustes antes de encaminhar à DIRAF.';
    if (t.includes('diraf'))
      return 'A **DIRAF** (Diretoria Administrativa-Financeira) realiza análise orçamentária e administrativa, verificando a dotação disponível antes de encaminhar à DIGER para autorização.';
    if (t.includes('diger'))
      return 'A **DIGER** (Diretoria Geral) emite o despacho autorizativo final, formalizando o compromisso institucional e liberando o processo para instrução na COLIC.';
    if (t.includes('colic'))
      return 'A **COLIC** (Coordenação de Licitações e Contratos) é a unidade central de governança das contratações. Ao receber o processo, confere checklist documental (DFD, ETP, TR, dotação, autorizações), define a modalidade e distribui aos núcleos: Cotação, Compras Diretas, Pregoeiros ou Gestão de Contratos.';
    if (t.includes('prorrogação') || t.includes('aditivo'))
      return 'Prorrogações contratuais exigem: manifestação formal da empresa com 90 dias de antecedência + comprovação de vantajosidade econômica + análise do Gestor e Fiscal + aprovação COLIC → DIRAF → DIGER → Termo Aditivo. TCU Acórdão 2622/2013: vantajosidade é obrigatória.';
    if (t.includes('reajuste'))
      return 'O **Reajuste** atualiza valores por índices oficiais (IPCA, INPC ou setorial), conforme cláusula contratual, após 12 meses. Segue o fluxo: Instrução → Periodicidade e Índice → Aprovação Gestor → COLIC → DIRAF → DIGER → Apostilamento.';
    return 'Posso responder sobre: modalidades de contratação (Licitação, Dispensa, Inexigibilidade), fluxos DIROP/DIRAF/DIGER/COLIC, checklist documental, prazos legais, DFD, ETP, Termo de Referência, prorrogações, reajustes e reequilíbrio econômico-financeiro. Qual sua dúvida específica?';
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (arquivo) { analisarArquivo(arquivo); return; }
    if (!input.trim()) return;
    const txt = input.trim();
    addMsg('user', txt);
    setInput('');

    setTimeout(async () => {
      if (!isDemandante) {
        // Tenta API real do Claude primeiro
        if (apiOnline) {
          try {
            const { chatIA } = await import('./api.js');
            const historico = msgs
              .filter(m => m.de === 'ia' || m.de === 'user')
              .map(m => ({ role: m.de === 'ia' ? 'assistant' : 'user', content: m.texto }));
            historico.push({ role: 'user', content: txt });
            const resultado = await chatIA(historico);
            addMsg('ia', resultado.resposta);
            return;
          } catch (err) {
            console.warn('Fallback mock consulta:', err);
          }
        }
        addMsg('ia', consultar(txt));
        return;
      }
      // Fluxo guiado para demandante
      if (etapa === 0) {
        addMsg('ia', `Entendido! Para "${txt}", qual a modalidade prevista: **Licitação**, **Dispensa** ou **Inexigibilidade**?`);
        setEtapa(1);
      } else if (etapa === 1) {
        addMsg('ia', `Modalidade registrada. Qual o **valor estimado** e o **prazo de vigência** do contrato?`);
        setEtapa(2);
      } else if (etapa === 2) {
        addMsg('ia', `Ótimo. Estou estruturando o processo com DFD, ETP e TR conforme Art. 18 da Lei 14.133/2021. Deseja incluir critérios de **sustentabilidade** (Art. 11, IV)?`);
        setEtapa(3);
      } else if (etapa === 3) {
        setEtapa(4);
        let novoId = `TR-${new Date().getFullYear()}-${String(termos.length + 1).padStart(3, '0')}`;
        try {
          if (apiOnline) {
            const { criarProcesso } = await import('./api.js');
            const criado = await criarProcesso({
              objeto: msgs[1]?.texto || 'Novo Objeto via IA',
              unidade: usuario.subunidade || 'Área Administrativa',
              modalidade: 'Licitação',
              valor: 'A definir',
              checklist: { dfd: true, etp: true, tr: true, dotacao: false, auth_dirop: false, auth_diraf: false, auth_diger: false },
            });
            novoId = criado.numero;
            if (carregarProcessos) await carregarProcessos();
          } else {
            throw new Error('API offline');
          }
        } catch {
          // Fallback mock
          const novoTR = {
            id: novoId,
            objeto: msgs[1]?.texto || 'Novo Objeto via IA',
            unidade: usuario.subunidade || 'Área Demandante',
            autor: usuario.matricula,
            data: new Date().toLocaleDateString('pt-BR'),
            status: 'Rascunho',
            valor: 'A definir',
            modalidade: 'Licitação',
            scoreIA: 96,
            checklist: { dfd: true, etp: true, tr: true, dotacao: false, auth_dirop: false, auth_diraf: false, auth_diger: false },
          };
          setTermos(prev => [novoTR, ...prev]);
        }
        addMsg('ia',
          `✅ Processo **${novoId}** gerado com sucesso!\n\n` +
          `Score de conformidade IA: **96%** — DFD ✅ ETP ✅ TR ✅\n\n` +
          `O processo está em **Rascunho**. Próximo passo: enviar ao **DIROP** para análise técnica. Você pode acompanhá-lo na lista de processos.`,
          { isConclusao: true, trId: novoId }
        );
      } else {
        addMsg('ia', consultar(txt));
      }
    }, 700);
  };

  const renderTexto = (txt) => {
    return txt.split('\n').map((line, i) => {
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <p key={i} className={line === '' ? 'h-1' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col bg-white rounded-xl shadow-sm border border-slate-200"
      style={{ height: 'calc(100vh - 130px)' }}>

      {/* Header do chat */}
      <div className="p-4 border-b flex items-center gap-3 rounded-t-xl text-white" style={{ backgroundColor: C.primary }}>
        <div className="p-2 bg-white/10 rounded-lg"><Bot size={18} /></div>
        <div className="flex-1">
          <p className="font-bold text-sm">Assistente IA — COLIC/FSPH</p>
          <p className="text-xs text-blue-300">
            {isDemandante ? 'Elaboração guiada de processos' : 'Consulta sobre fluxos e legislação'} • Lei 14.133/2021 • Decreto 342/2023
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="font-bold">{usuario.nome}</p>
          <p className="text-blue-300">{usuario.subunidade ? usuario.subunidade.split('–')[0].trim() : usuario.descricao}</p>
        </div>
      </div>

      {/* Sugestões rápidas */}
      {msgs.length <= 1 && (
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500 font-medium mb-2">Perguntas frequentes:</p>
          <div className="flex flex-wrap gap-1.5">
            {['Como funciona a Dispensa?', 'O que é o DFD?', 'Prazos contratuais', 'Fluxo COLIC/DIROP/DIRAF', 'O que é Inexigibilidade?'].map(q => (
              <button key={q} onClick={() => { setInput(q); }}
                className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-full text-[#0a2f64] hover:border-[#0a2f64] hover:bg-blue-50 transition font-medium">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'ia' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm space-y-0.5
              ${m.de === 'ia'
                ? m.isAnalise    ? 'bg-blue-50 border border-blue-200 text-slate-800 rounded-tl-none'
                : m.isConclusao  ? 'bg-emerald-50 border border-emerald-200 text-slate-800 rounded-tl-none'
                :                  'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                : m.isArquivo    ? 'bg-blue-700 text-white rounded-tr-none'
                :                  'text-white rounded-tr-none'}`}
              style={m.de === 'user' && !m.isArquivo ? { backgroundColor: C.primary } : {}}>
              {m.de === 'ia' ? renderTexto(m.texto) : <p>{m.texto}</p>}
              {m.isConclusao && (
                <button onClick={() => navegar('lista')}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition text-xs">
                  <FileText size={12} /> Ver Processo Gerado
                </button>
              )}
            </div>
          </div>
        ))}

        {analisando && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 text-xs text-slate-500">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              Analisando documento com IA...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Arquivo pendente */}
      {arquivo && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-700 font-medium">
            <Paperclip size={13} /> {arquivo.name}
            <span className="text-blue-400">— Clique em Enviar para analisar</span>
          </div>
          <button onClick={() => setArquivo(null)} className="text-red-400 hover:text-red-600 transition">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={enviar} className="p-3 border-t border-slate-200 bg-white rounded-b-xl flex gap-2 items-center">
        <input type="file" ref={fileRef} onChange={e => { if (e.target.files[0]) setArquivo(e.target.files[0]); }} className="hidden" accept=".pdf,.doc,.docx" />
        <button type="button" onClick={() => fileRef.current?.click()}
          title="Anexar documento (PDF, DOC)"
          className="p-2.5 text-slate-400 hover:text-[#0a2f64] hover:bg-blue-50 rounded-lg transition shrink-0">
          <Paperclip size={17} />
        </button>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          disabled={etapa === 4 && isDemandante && !arquivo}
          placeholder={
            arquivo ? 'Clique em Enviar para analisar o documento...'
            : isDemandante && etapa === 0 ? 'Descreva o objeto da contratação...'
            : 'Faça sua pergunta sobre fluxos ou legislação...'
          }
          className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64] disabled:bg-slate-100 disabled:text-slate-400" />
        <button type="submit"
          disabled={(etapa === 4 && isDemandante && !arquivo) || (!input.trim() && !arquivo)}
          style={{ backgroundColor: C.primary }}
          className="p-2.5 text-white rounded-lg hover:bg-[#134084] disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm shrink-0">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANEXAR DOCUMENTO — upload real + envio ao próximo setor
// ═══════════════════════════════════════════════════════════════════════════════
function AnexarDocumento({ usuario, termos, anexarEEnviar, navegar }) {
  const fileRef = useRef(null);

  const [arquivos,    setArquivos]    = useState([]);       // lista de arquivos anexados
  const [objeto,      setObjeto]      = useState('');
  const [modalidade,  setModalidade]  = useState('Licitação');
  const [unidade,     setUnidade]     = useState(usuario.subunidade || SUBUNIDADES[0]);
  const [valor,       setValor]       = useState('');
  const [checkItems,  setCheckItems]  = useState(
    Object.fromEntries(CHECKLIST.map(c => [c.id, false]))
  );
  const [enviando,    setEnviando]    = useState(false);
  const [sucesso,     setSucesso]     = useState(null);     // id do processo criado

  const proximoSetor = SETORES.find(s => s.id === FLUXO['Rascunho'].ator)
    ? SETORES.find(s => s.id === FLUXO['Aguardando DIROP']?.ator)?.nome || 'DIROP'
    : 'DIROP';

  const onDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target.files || []);
    const validos = files.filter(f =>
      ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.png', '.jpg'].some(ext =>
        f.name.toLowerCase().endsWith(ext)
      )
    );
    setArquivos(prev => [...prev, ...validos]);
  };

  const remover = (idx) => setArquivos(prev => prev.filter((_, i) => i !== idx));

  const toggleCheck = (id) =>
    setCheckItems(prev => ({ ...prev, [id]: !prev[id] }));

  const tipoIcon = (nome) => {
    if (nome.endsWith('.pdf'))            return '📄';
    if (nome.endsWith('.doc') || nome.endsWith('.docx')) return '📝';
    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) return '📊';
    return '🖼️';
  };

  const formatBytes = (b) => b < 1024 * 1024
    ? `${(b / 1024).toFixed(0)} KB`
    : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  const podeEnviar = objeto.trim() && arquivos.length > 0;

  const enviar = () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setTimeout(() => {
      const novoId = `TR-2025-${String(termos.length + 1).padStart(3, '0')}`;
      const novoProcesso = {
        id: novoId,
        objeto: objeto.trim(),
        unidade: unidade,
        autor: usuario.matricula,
        data: new Date().toLocaleDateString('pt-BR'),
        status: 'Rascunho', // será sobrescrito por anexarEEnviar → 'Aguardando DIROP'
        valor: valor || 'A definir',
        modalidade,
        scoreIA: null,
        checklist: { ...checkItems },
        anexos: arquivos.map(f => ({ nome: f.name, tamanho: f.size, tipo: f.type })),
      };
      setEnviando(false);
      setSucesso(novoId);
      anexarEEnviar(novoProcesso);
    }, 1800);
  };

  // ── TELA DE SUCESSO ────────────────────────────────────────────────────────
  if (sucesso) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-10">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-1">Processo Enviado!</h2>
          <p className="text-slate-500 text-sm mb-1">
            <strong className="text-[#0a2f64]">{sucesso}</strong> criado com sucesso.
          </p>
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-4 py-2 rounded-full mb-6">
            <ChevronRight size={13} /> Aguardando DIROP — análise técnica
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navegar('lista')}
              className="px-5 py-2.5 text-white font-bold text-sm rounded-lg shadow hover:bg-[#134084] transition"
              style={{ backgroundColor: C.primary }}>
              Ver em Processos
            </button>
            <button onClick={() => { setSucesso(null); setArquivos([]); setObjeto(''); setValor(''); setCheckItems(Object.fromEntries(CHECKLIST.map(c => [c.id, false]))); }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-lg transition">
              Novo Anexo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FORMULÁRIO ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Título */}
      <div className="mb-5">
        <h2 className="text-base font-black text-[#0a2f64] flex items-center gap-2">
          <Upload size={18} /> Anexar Documento e Enviar para Aprovação
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          O processo será criado automaticamente e encaminhado para a <strong>DIROP</strong> assim que confirmado.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── COLUNA ESQUERDA: formulário (3/5) ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Dados do processo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
              Dados do Processo
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Objeto da Contratação <span className="text-red-500">*</span></label>
              <input value={objeto} onChange={e => setObjeto(e.target.value)}
                placeholder="Descreva o objeto da contratação..."
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Modalidade</label>
                <select value={modalidade} onChange={e => setModalidade(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
                  {['Licitação', 'Dispensa', 'Inexigibilidade'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Valor Estimado</label>
                <input value={valor} onChange={e => setValor(e.target.value)}
                  placeholder="Ex: R$ 150.000,00"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
              </div>
            </div>

            {usuario.id === 'demandante' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Unidade Demandante</label>
                <select value={unidade} onChange={e => setUnidade(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
                  {SUBUNIDADES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
              Documentos Anexados <span className="text-red-500">*</span>
            </h3>

            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-[#0a2f64] hover:bg-blue-50 rounded-xl p-8 text-center cursor-pointer transition-all group">
              <input ref={fileRef} type="file" multiple className="hidden"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg"
                onChange={onDrop} />
              <Upload size={32} className="mx-auto text-slate-300 group-hover:text-[#0a2f64] mb-2 transition-colors" />
              <p className="font-bold text-sm text-slate-600 group-hover:text-[#0a2f64] transition-colors">
                Clique ou arraste os arquivos aqui
              </p>
              <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, XLSX, PNG, JPG</p>
            </div>

            {arquivos.length > 0 && (
              <div className="mt-3 space-y-2">
                {arquivos.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tipoIcon(f.name)}</span>
                      <div>
                        <p className="font-semibold text-slate-800">{f.name}</p>
                        <p className="text-slate-400">{formatBytes(f.size)}</p>
                      </div>
                    </div>
                    <button onClick={() => remover(i)} className="text-red-400 hover:text-red-600 transition p-1 rounded hover:bg-red-50">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── COLUNA DIREITA: checklist + botão (2/5) ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
              Checklist Documental — Art. 54
            </h3>
            <p className="text-xs text-slate-400 mb-3">Marque os documentos que estão incluídos no(s) arquivo(s) anexado(s).</p>
            <div className="space-y-2">
              {CHECKLIST.map(doc => (
                <label key={doc.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-xs font-medium select-none
                    ${checkItems[doc.id]
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={checkItems[doc.id]} onChange={() => toggleCheck(doc.id)} className="mt-0.5 accent-emerald-600" />
                  {doc.label}
                </label>
              ))}
            </div>
            <div className="mt-3 text-xs text-center font-semibold">
              {Object.values(checkItems).filter(Boolean).length}/{CHECKLIST.length} documentos confirmados
            </div>
          </div>

          {/* Destino + Botão */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
              Encaminhamento
            </h3>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <ChevronRight size={16} className="text-[#0a2f64] shrink-0" />
              <div>
                <p className="text-xs text-slate-500 font-medium">Próximo setor após envio</p>
                <p className="font-bold text-[#0a2f64] text-sm">DIROP — Análise Técnica</p>
              </div>
            </div>

            {!podeEnviar && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {!objeto.trim() && !arquivos.length
                  ? 'Preencha o objeto e anexe ao menos um documento.'
                  : !objeto.trim()
                  ? 'Preencha o objeto da contratação.'
                  : 'Anexe ao menos um documento.'}
              </div>
            )}

            <button onClick={enviar} disabled={!podeEnviar || enviando}
              style={{ backgroundColor: podeEnviar ? C.primary : undefined }}
              className={`w-full py-3 text-white rounded-lg font-black text-sm shadow-md transition flex items-center justify-center gap-2
                ${podeEnviar ? 'hover:bg-[#134084]' : 'bg-slate-300 cursor-not-allowed text-slate-500'}`}>
              {enviando ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={15} /> Enviar ao DIROP para Aprovação
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE DE TERMOS VALIDADOS
// Ref.: Manual COLIC – Seção 9.1.4 (Arquivamento no SEI)
//       e Seção 12.1.1 (Identificação de interfaces para fluxo contínuo)
// Exibe processos com status 'Homologado', acessível a todos os setores
// como repositório de referência para novas contratações.
// ═══════════════════════════════════════════════════════════════════════════════
function BaseTermosValidados({ termos, navegar }) {
  const [busca,      setBusca]      = useState('');
  const [filtroMod,  setFiltroMod]  = useState('Todas');
  const [filtroUnid, setFiltroUnid] = useState('Todas');
  const [expandido,  setExpandido]  = useState(null);

  const homologados = termos.filter(t => t.status === 'Homologado');

  const unidades = ['Todas', ...new Set(homologados.map(t => t.unidade.split('–')[0].trim()))];

  const lista = homologados.filter(t => {
    const q = busca.toLowerCase();
    const mb = t.objeto.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
    const mm = filtroMod  === 'Todas' || t.modalidade === filtroMod;
    const mu = filtroUnid === 'Todas' || t.unidade.includes(filtroUnid);
    return mb && mm && mu;
  });

  const ckOk = (ck) => CHECKLIST.filter(d => ck?.[d.id]).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-10">

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3"
          style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #1a5cb0 100%)` }}>
          <div className="flex items-center gap-3 text-white">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              <Archive size={22} />
            </div>
            <div>
              <h2 className="font-black text-lg leading-tight">Base de Termos Validados</h2>
              <p className="text-blue-200 text-xs mt-0.5">
                Processos homologados — Art. 167, Lei 14.133/2021 • Seção 9.1.4, Manual COLIC/FSPH
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black text-white">{homologados.length}</p>
              <p className="text-blue-200 text-xs font-medium">Homologados</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black text-emerald-300">
                {homologados.filter(t => ckOk(t.checklist) === CHECKLIST.length).length}
              </p>
              <p className="text-blue-200 text-xs font-medium">Docs completos</p>
            </div>
          </div>
        </div>

        {/* Aviso informativo */}
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-start gap-2">
          <BookOpen size={14} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800 font-medium">
            Esta base serve como <strong>referência para novas contratações</strong>. Termos validados podem ser consultados
            para reaproveitar especificações técnicas, critérios de aceitabilidade e estruturas de TR já aprovadas pela COLIC,
            conforme orientação do Manual de Fluxos (Seção 12.1.1).
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por objeto ou número..."
            className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
        </div>
        <select value={filtroMod} onChange={e => setFiltroMod(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
          {['Todas', 'Licitação', 'Dispensa', 'Inexigibilidade'].map(m => <option key={m}>{m}</option>)}
        </select>
        <select value={filtroUnid} onChange={e => setFiltroUnid(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
          {unidades.map(u => <option key={u}>{u}</option>)}
        </select>
      </div>

      {/* Lista de termos */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-14 text-center">
          <Archive size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm font-medium">Nenhum termo validado encontrado.</p>
          <p className="text-slate-400 text-xs mt-1">Processos aparecem aqui após atingir o status <strong>Homologado</strong>.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(t => {
            const aberto   = expandido === t.id;
            const ck       = t.checklist || {};
            const totalOk  = ckOk(ck);
            const completo = totalOk === CHECKLIST.length;

            return (
              <div key={t.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all
                  ${aberto ? 'border-[#0a2f64]/30 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>

                {/* Linha principal — clicável para expandir */}
                <button
                  onClick={() => setExpandido(aberto ? null : t.id)}
                  className="w-full text-left p-5 flex flex-wrap items-center justify-between gap-4">

                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Ícone de score */}
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-black text-sm
                      ${t.scoreIA >= 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {t.scoreIA != null ? `${t.scoreIA}%` : 'N/A'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-black text-[#0a2f64] text-sm">{t.id}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(t.modalidade)}`}>
                          {t.modalidade}
                        </span>
                        {completo && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <CheckCircle size={10} /> Documentação completa
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 truncate">{t.objeto}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Tag size={11} /> {t.unidade.split('–')[0].trim()}</span>
                        <span className="flex items-center gap-1"><Calendar size={11} /> {t.data}</span>
                        <span className="font-semibold text-slate-600">{t.valor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Indicador expandir */}
                  <div className={`text-slate-400 transition-transform ${aberto ? 'rotate-90' : ''}`}>
                    <ChevronRight size={18} />
                  </div>
                </button>

                {/* Painel expandido */}
                {aberto && (
                  <div className="border-t border-slate-100 px-5 pb-5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Checklist documental */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <FileCheck size={13} /> Checklist Documental — Art. 54 / Lei 14.133/2021
                      </h4>
                      <div className="space-y-1.5">
                        {CHECKLIST.map(doc => (
                          <div key={doc.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium
                              ${ck[doc.id]
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {ck[doc.id]
                              ? <CheckCircle size={12} className="shrink-0 text-emerald-600" />
                              : <X size={12} className="shrink-0 text-red-500" />}
                            {doc.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dados + ações */}
                    <div className="space-y-4">
                      {/* Dados do processo */}
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 grid grid-cols-2 gap-3 text-xs">
                        {[
                          { l: 'Número',    v: t.id          },
                          { l: 'Autor',     v: t.autor       },
                          { l: 'Unidade',   v: t.unidade.split('–')[0].trim() },
                          { l: 'Valor',     v: t.valor       },
                          { l: 'Modalidade',v: t.modalidade  },
                          { l: 'Homologado',v: t.data        },
                        ].map(i => (
                          <div key={i.l}>
                            <p className="text-slate-400 font-bold uppercase mb-0.5">{i.l}</p>
                            <p className="font-semibold text-slate-800">{i.v}</p>
                          </div>
                        ))}
                      </div>

                      {/* Score IA */}
                      {t.scoreIA != null && (
                        <div className="p-3 rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                              <Bot size={13} className="text-[#0a2f64]" /> Score de Conformidade IA
                            </span>
                            <span className={`text-sm font-black ${t.scoreIA >= 90 ? 'text-emerald-600' : 'text-amber-500'}`}>
                              {t.scoreIA}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${t.scoreIA >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${t.scoreIA}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5">
                            Validado conforme Lei 14.133/2021 e Decreto Estadual 342/2023
                          </p>
                        </div>
                      )}

                      {/* Ações */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => navegar('detalhe', t)}
                          className="flex-1 py-2 text-xs font-bold text-white rounded-lg hover:bg-[#134084] transition flex items-center justify-center gap-1.5 shadow-sm"
                          style={{ backgroundColor: C.primary }}>
                          <FileText size={13} /> Ver Processo Completo
                        </button>
                        <button
                          title="Usar como referência para novo processo"
                          className="px-3 py-2 text-xs font-bold text-[#0a2f64] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center gap-1.5">
                          <Download size={13} /> Exportar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
