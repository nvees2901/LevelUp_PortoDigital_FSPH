import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Upload, MessageSquare, PieChart, Users,
  CheckCircle, AlertTriangle, Clock, Search,
  ChevronRight, ArrowLeft, LogOut, FileCheck, ShieldCheck,
  Download, Send, Bot, Lock, User, Paperclip, X,
  Building2, Activity, FlaskConical
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

// ═══════════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [usuario, setUsuario]           = useState(null);
  const [setorStep, setSetorStep]       = useState(null);
  const [termos, setTermos]             = useState(DADOS);
  const [tela, setTela]                 = useState('dashboard');
  const [termoSel, setTermoSel]         = useState(null);

  const navegar = (t, termo = null) => { setTela(t); if (termo) setTermoSel(termo); };

  const handleLogin = (e) => {
    e.preventDefault();
    setUsuario({
      ...setorStep,
      matricula: e.target.matricula.value || 'Usuário',
      subunidade: e.target.subunidade?.value || null,
    });
    setTela('dashboard');
  };

  const avancar = (id) => {
    setTermos(prev => prev.map(t => {
      if (t.id !== id) return t;
      const prox = FLUXO[t.status]?.proximo;
      return prox ? { ...t, status: prox } : t;
    }));
    navegar('lista');
  };

  const devolver = (id) => {
    setTermos(prev => prev.map(t => {
      if (t.id !== id) return t;
      const idx = ETAPAS.indexOf(t.status);
      return idx > 0 ? { ...t, status: ETAPAS[idx - 1] } : t;
    }));
    navegar('lista');
  };

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!usuario) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ backgroundColor: C.primary }} className="shadow-lg">
          <div className="max-w-5xl mx-auto py-7 px-6 flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
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
      case 'chat':      return <ChatIA usuario={usuario} termos={termos} setTermos={setTermos} navegar={navegar} />;
      default:          return <Dashboard usuario={usuario} termos={termos} navegar={navegar} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* HEADER */}
      <header className="z-20 shadow-md flex flex-col">
        <div style={{ backgroundColor: C.primary }} className="py-2.5 px-5 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
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
              { id: 'dashboard', label: 'Dashboard',   icon: PieChart     },
              { id: 'lista',     label: 'Processos',   icon: FileText     },
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
            <div className="px-3 py-2 mt-1">
              <p className="text-xs text-slate-400 leading-relaxed">
                {usuario.id === 'demandante'
                  ? '💡 Elabore processos e analise documentos com IA.'
                  : '💡 Consulte fluxos, legislação e analise documentos.'}
              </p>
            </div>
          </nav>
          <div className="p-3 border-t border-slate-200">
            <button onClick={() => { setUsuario(null); setSetorStep(null); }}
              className="flex items-center gap-2 text-red-500 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors text-sm font-medium">
              <LogOut size={16} /> Sair do Sistema
            </button>
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
// DETALHE DO PROCESSO
// ═══════════════════════════════════════════════════════════════════════════════
function DetalheTermo({ usuario, termo, avancar, devolver, navegar }) {
  if (!termo) return null;

  const conf      = FLUXO[termo.status];
  const podeAgir  = conf && conf.ator === usuario.id;
  const ck        = termo.checklist || {};
  const ckTotal   = CHECKLIST.length;
  const ckOk      = CHECKLIST.filter(d => ck[d.id]).length;
  const idxAtual  = ETAPAS.indexOf(termo.status);

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
                  <h1 className="text-xl font-black text-[#0a2f64]">{termo.id}</h1>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(termo.modalidade)}`}>{termo.modalidade}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(termo.status)}`}>{termo.status}</span>
                </div>
                <p className="text-sm text-slate-700 font-medium">{termo.objeto}</p>
              </div>
              <button className="p-2 text-slate-400 hover:text-[#0a2f64] hover:bg-blue-50 rounded-lg transition" title="Exportar">
                <Download size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg text-xs mb-5 border border-slate-100">
              {[
                { l: 'Unidade',       v: termo.unidade.split('–')[0].trim() },
                { l: 'Autor',         v: termo.autor                        },
                { l: 'Valor Estimado',v: termo.valor                        },
                { l: 'Data',          v: termo.data                         },
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 text-white flex items-center justify-between" style={{ backgroundColor: C.primary }}>
              <span className="font-bold text-sm flex items-center gap-1.5"><Bot size={15} /> Análise IA</span>
              <span className={`text-xl font-black ${termo.scoreIA ? 'text-emerald-400' : 'text-slate-300'}`}>
                {termo.scoreIA != null ? `${termo.scoreIA}%` : '--'}
              </span>
            </div>
            <div className="p-4 text-xs space-y-2.5">
              {termo.scoreIA != null ? (
                <>
                  <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">Art. 18 (Fase Preparatória) contemplado.</span></div>
                  <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">Art. 23 (Valor Estimado) fundamentado.</span></div>
                  {termo.scoreIA < 100 && (
                    <div className="flex items-start gap-1.5 p-2 bg-amber-50 rounded border border-amber-100">
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-amber-800">Detalhar critérios de sustentabilidade (Art. 11, IV).</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-slate-400 mb-2">Documento ainda não analisado.</p>
                  <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition">Solicitar Análise</button>
                </div>
              )}
            </div>
          </div>

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
                <button onClick={() => avancar(termo.id)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow transition flex justify-center items-center gap-2">
                  <CheckCircle size={15} /> {conf.acao}
                </button>
                <button onClick={() => devolver(termo.id)}
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
function ChatIA({ usuario, termos, setTermos, navegar }) {
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

  // Análise de arquivo
  const analisarArquivo = (file) => {
    addMsg('user', `📎 Arquivo anexado para análise: ${file.name}`, { isArquivo: true });
    setArquivo(null);
    setAnalisando(true);
    setTimeout(() => {
      setAnalisando(false);
      addMsg('ia',
        `📊 Análise concluída — "${file.name}"\n\n` +
        `Score de conformidade (Lei 14.133/2021): **82%**\n\n` +
        `✅ DFD – Documento de Formalização identificado\n` +
        `✅ ETP – Estudo Técnico Preliminar presente\n` +
        `✅ Termo de Referência estruturado\n` +
        `✅ Dotação orçamentária declarada\n` +
        `⚠️ Atenção: não localizei cláusula de sanções administrativas (obrigatória pelo Art. 156).\n` +
        `⚠️ Critérios de sustentabilidade (Art. 11, IV) ausentes.\n\n` +
        `Recomendo complementar esses itens antes de enviar ao DIROP.`,
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

  const enviar = (e) => {
    e.preventDefault();
    if (arquivo) { analisarArquivo(arquivo); return; }
    if (!input.trim()) return;
    const txt = input.trim();
    addMsg('user', txt);
    setInput('');

    setTimeout(() => {
      if (!isDemandante) {
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
        const novoTR = {
          id: `TR-2025-00${termos.length + 1}`,
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
        addMsg('ia',
          `✅ Processo **${novoTR.id}** gerado com sucesso!\n\n` +
          `Score de conformidade IA: **96%** — DFD ✅ ETP ✅ TR ✅\n\n` +
          `O processo está em **Rascunho**. Próximo passo: enviar ao **DIROP** para análise técnica. Você pode acompanhá-lo na lista de processos.`,
          { isConclusao: true, trId: novoTR.id }
        );
        setEtapa(4);
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
