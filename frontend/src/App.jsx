import React, { useState } from 'react';
import { 
  FileText, Upload, MessageSquare, PieChart, Users, 
  CheckCircle, AlertTriangle, Clock, Search, Filter, 
  ChevronRight, ArrowLeft, LogOut, FileCheck, ShieldCheck, 
  Download, Send, Bot, Lock, User
} from 'lucide-react';

// --- MOCK DATA E CONFIGURAÇÕES ---

// Cores Oficiais (Baseadas no site fornecido)
const COLORS = {
  primary: '#0a2f64', // Azul escuro FSPH
  primaryHover: '#134084',
};

const SETORES = [
  { id: 'demandante', nome: 'Área Demandante', icon: Users },
  { id: 'diretoria', nome: 'Diretoria (Superior)', icon: PieChart },
  { id: 'contratos', nome: 'Setor de Contratos', icon: FileText },
  { id: 'controle', nome: 'Controle Interno', icon: ShieldCheck },
  { id: 'juridico', nome: 'Assessoria Jurídica', icon: FileCheck },
  { id: 'financeiro', nome: 'Setor Financeiro', icon: PieChart }
];

const FLUXO = {
  'Rascunho': { proximo: 'Aguardando Diretoria', ator: 'demandante', acao: 'Enviar para Diretoria' },
  'Aguardando Diretoria': { proximo: 'Aguardando Contratos', ator: 'diretoria', acao: 'Aprovar e Enviar p/ Contratos' },
  'Aguardando Contratos': { proximo: 'Aguardando Controle Interno', ator: 'contratos', acao: 'Aprovar e Enviar p/ Controle Interno' },
  'Aguardando Controle Interno': { proximo: 'Aguardando Jurídico', ator: 'controle', acao: 'Aprovar e Enviar p/ Jurídico' },
  'Aguardando Jurídico': { proximo: 'Aguardando Financeiro', ator: 'juridico', acao: 'Parecer Favorável - Enviar p/ Financeiro' },
  'Aguardando Financeiro': { proximo: 'Retorno Contratos (Final)', ator: 'financeiro', acao: 'Aprovar Dotação - Retornar p/ Contratos' },
  'Retorno Contratos (Final)': { proximo: 'Concluído (Pronto para Edital)', ator: 'contratos', acao: 'Finalizar TR e Preparar Edital' },
  'Concluído (Pronto para Edital)': { proximo: null, ator: null, acao: null }
};

const DADOS_INICIAIS = [
  { id: 'TR-2023-001', objeto: 'Aquisição de Equipamentos de EPI', autor: 'Douglas (Almoxarifado)', data: '20/10/2023', status: 'Aguardando Jurídico', valor: 'R$ 150.000,00', scoreIA: 92 },
  { id: 'TR-2023-002', objeto: 'Contratação de Empresa de Limpeza', autor: 'Maria (Manutenção)', data: '21/10/2023', status: 'Aguardando Diretoria', valor: 'R$ 850.000,00', scoreIA: 88 },
  { id: 'TR-2023-003', objeto: 'Serviço de Manutenção de Ar Condicionado', autor: 'João (Infraestrutura)', data: '22/10/2023', status: 'Aguardando Contratos', valor: 'R$ 85.000,00', scoreIA: 95 },
  { id: 'TR-2023-004', objeto: 'Compra de Insumos Laboratoriais', autor: 'Douglas (Almoxarifado)', data: '24/10/2023', status: 'Rascunho', valor: 'R$ 320.000,00', scoreIA: null },
  { id: 'TR-2023-005', objeto: 'Renovação Licenças de Software', autor: 'TI', data: '15/10/2023', status: 'Retorno Contratos (Final)', valor: 'R$ 45.000,00', scoreIA: 100 },
];

// --- COMPONENTE DE DECORAÇÃO (Barra de Cores Sergipe) ---
const FaixaCores = () => (
  <div className="flex h-2 w-full">
    <div className="bg-green-600 flex-1"></div>
    <div className="bg-yellow-400 flex-1"></div>
    <div className="bg-blue-600 flex-1"></div>
  </div>
);

// --- COMPONENTES PRINCIPAIS ---

export default function App() {
  const [usuarioAtual, setUsuarioAtual] = useState(null); 
  const [setorSelecionado, setSetorSelecionado] = useState(null); // Estado para o passo 1 do login
  
  const [termos, setTermos] = useState(DADOS_INICIAIS);
  const [telaAtual, setTelaAtual] = useState('dashboard');
  const [termoSelecionado, setTermoSelecionado] = useState(null);

  // --- FLUXO DE LOGIN (2 Etapas) ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setUsuarioAtual({
      ...setorSelecionado,
      nomeUsuarioLogado: e.target.matricula.value || 'Usuário Padrão'
    });
    setTelaAtual('dashboard');
  };

  if (!usuarioAtual) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center">
        {/* Cabeçalho do Login (Fundo Azul e centralizado) */}
        <div className="w-full shadow-sm" style={{ backgroundColor: COLORS.primary }}>
          <div className="max-w-7xl mx-auto py-6 px-4 flex justify-center items-center">
            <img 
              src="/logo-fsph.png" 
              alt="Logo FSPH e Governo de Sergipe" 
              className="h-20 object-contain drop-shadow-md" 
              onError={(e) => {
                e.target.onerror = null; 
                e.target.src = "https://via.placeholder.com/400x100?text=LOGO+FSPH+-+Governo+de+Sergipe";
              }} 
            />
          </div>
          <FaixaCores />
        </div>

        <div className="flex-1 flex flex-col justify-center items-center p-4 w-full">
          <div className="max-w-4xl w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-[#0a2f64] mb-2">Sistema Inteligente de TRs</h1>
              <p className="text-slate-600">Gestão de Termos de Referência (Lei 14.133/2021)</p>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-xl border border-slate-100 relative overflow-hidden">
              {/* Etapa 1: Selecionar Setor */}
              {!setorSelecionado ? (
                <>
                  <h2 className="text-2xl font-semibold mb-6 text-center text-slate-700">Selecione o seu Setor</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {SETORES.map(setor => (
                      <button
                        key={setor.id}
                        onClick={() => setSetorSelecionado(setor)}
                        className="bg-white border-2 border-slate-200 hover:border-[#0a2f64] text-slate-700 hover:text-[#0a2f64] transition-all p-6 rounded-lg flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md"
                      >
                        <setor.icon size={40} className="text-[#0a2f64] opacity-80" />
                        <span className="font-medium text-lg text-center">{setor.nome}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                /* Etapa 2: Formulário de Usuário e Senha */
                <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <button 
                    onClick={() => setSetorSelecionado(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-[#0a2f64] mb-6 text-sm font-medium transition-colors"
                  >
                    <ArrowLeft size={16} /> Voltar para seleção de setores
                  </button>
                  
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                      {React.createElement(setorSelecionado.icon, { size: 32, className: "text-[#0a2f64]" })}
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-800">{setorSelecionado.nome}</h2>
                    <p className="text-slate-500 text-sm mt-1">Insira suas credenciais para acessar</p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nº de Usuário / Matrícula</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                          type="text" 
                          name="matricula"
                          required
                          placeholder="Digite seu usuário"
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] focus:border-[#0a2f64] transition-all"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                          type="password" 
                          required
                          placeholder="••••••••"
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] focus:border-[#0a2f64] transition-all"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      style={{ backgroundColor: COLORS.primary }}
                      className="w-full py-3 mt-4 text-white rounded-lg font-medium shadow-md hover:bg-[#134084] transition-colors"
                    >
                      Entrar no Sistema
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

  // --- FUNÇÕES DE NAVEGAÇÃO E AÇÕES ---
  const navegarPara = (tela, termo = null) => {
    setTelaAtual(tela);
    if (termo) setTermoSelecionado(termo);
  };

  const avancarFluxo = (termoId) => {
    setTermos(termos.map(t => {
      if (t.id === termoId) {
        const confAtual = FLUXO[t.status];
        if (confAtual && confAtual.proximo) {
          return { ...t, status: confAtual.proximo };
        }
      }
      return t;
    }));
    navegarPara('lista');
  };

  const renderConteudoPrincipal = () => {
    switch (telaAtual) {
      case 'dashboard': return <Dashboard usuarioAtual={usuarioAtual} termos={termos} navegar={navegarPara} />;
      case 'lista': return <ListaTermos usuarioAtual={usuarioAtual} termos={termos} navegar={navegarPara} />;
      case 'detalhe': return <DetalheTermo usuarioAtual={usuarioAtual} termo={termoSelecionado} avancarFluxo={avancarFluxo} navegar={navegarPara} />;
      case 'chat': return <ChatIA navegar={navegarPara} setTermos={setTermos} termos={termos} />;
      case 'analise': return <AnaliseUpload navegar={navegarPara} />;
      default: return <Dashboard usuarioAtual={usuarioAtual} termos={termos} navegar={navegarPara} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      
      {/* CABEÇALHO GLOBAL PÓS LOGIN */}
      <header className="w-full flex flex-col z-20 shadow-md relative">
        <div style={{ backgroundColor: COLORS.primary }} className="text-white py-3 px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Logo" className="h-10 bg-white p-1 rounded object-contain" onError={(e) => {
              e.target.onerror = null; 
              e.target.src = "https://via.placeholder.com/150x40?text=Logo+Aqui";
            }} />
            <div className="hidden md:block border-l border-blue-800 pl-4">
              <h1 className="font-bold text-lg leading-tight tracking-wide">Plataforma TR</h1>
              <span className="text-xs text-blue-200">Fundação de Saúde Parreiras Horta</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold">{usuarioAtual.nome}</p>
              <p className="text-xs text-blue-200 uppercase">Matrícula: {usuarioAtual.nomeUsuarioLogado}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white text-[#0a2f64] flex items-center justify-center font-bold shadow-sm">
              {React.createElement(usuarioAtual.icon, { size: 20 })}
            </div>
          </div>
        </div>
        <FaixaCores />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto mt-2">
            <p className="text-xs uppercase text-slate-400 font-bold mb-3 px-2 tracking-wider">Menu Principal</p>
            <MenuButton icone={PieChart} texto="Dashboard" ativo={telaAtual === 'dashboard'} onClick={() => navegarPara('dashboard')} />
            <MenuButton icone={FileText} texto="Base de Termos" ativo={telaAtual === 'lista'} onClick={() => navegarPara('lista')} />
            
            {(usuarioAtual.id === 'demandante' || usuarioAtual.id === 'contratos') && (
              <>
                <div className="pt-6 pb-2">
                  <p className="text-xs uppercase text-slate-400 font-bold px-2 tracking-wider">Inteligência Artificial</p>
                </div>
                <MenuButton icone={MessageSquare} texto="Gerar via Chat IA" ativo={telaAtual === 'chat'} onClick={() => navegarPara('chat')} />
                <MenuButton icone={Upload} texto="Analisar Documento" ativo={telaAtual === 'analise'} onClick={() => navegarPara('analise')} />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <button 
              onClick={() => { setUsuarioAtual(null); setSetorSelecionado(null); }}
              className="flex items-center gap-3 text-red-600 hover:text-red-800 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors font-medium"
            >
              <LogOut size={18} />
              <span>Sair do Sistema</span>
            </button>
          </div>
        </aside>

        {/* ÁREA PRINCIPAL */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100/50">
          <div className="flex-1 overflow-auto p-6 relative">
            {renderConteudoPrincipal()}
          </div>
        </main>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES DE TELA ---

function MenuButton({ icone: Icon, texto, ativo, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-3 rounded-lg transition-all font-medium ${ativo ? 'bg-[#0a2f64] text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'}`}
    >
      <Icon size={20} />
      <span>{texto}</span>
    </button>
  );
}

function Dashboard({ usuarioAtual, termos, navegar }) {
  const meusPendentes = termos.filter(t => FLUXO[t.status]?.ator === usuarioAtual.id);
  const totalValidados = termos.filter(t => t.scoreIA > 80).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Cards Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Total de TRs</p>
              <h3 className="text-3xl font-bold text-[#0a2f64]">{termos.length}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-[#0a2f64] rounded-lg"><FileText size={24} /></div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Pendentes Comigo</p>
              <h3 className="text-3xl font-bold text-amber-600">{meusPendentes.length}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Clock size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Validados (Lei 14.133)</p>
              <h3 className="text-3xl font-bold text-emerald-600">{totalValidados}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
           <button 
             onClick={() => navegar('lista')}
             className="w-full py-3 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084] transition font-medium flex items-center justify-center gap-2 shadow-md"
           >
             Acessar Base <ChevronRight size={18} />
           </button>
        </div>
      </div>

      {/* Lista de Ação Rápida */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center">
          <h3 className="font-bold text-[#0a2f64] flex items-center gap-2 text-lg">
            <AlertTriangle className="text-amber-500" size={22} /> 
            Requer Sua Atenção ({usuarioAtual.nome})
          </h3>
        </div>
        <div className="p-0 bg-slate-50">
          {meusPendentes.length > 0 ? (
             <div className="divide-y divide-slate-200">
               {meusPendentes.map(t => (
                 <div key={t.id} className="p-5 hover:bg-white flex flex-col md:flex-row md:items-center justify-between transition-colors gap-4">
                   <div>
                     <p className="font-semibold text-slate-800 text-lg">{t.id} - {t.objeto}</p>
                     <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                       <User size={14} /> Autor: {t.autor} <span className="text-slate-300">|</span> 
                       <PieChart size={14} /> Valor Est.: <span className="font-medium text-slate-700">{t.valor}</span>
                     </p>
                   </div>
                   <button 
                     onClick={() => navegar('detalhe', t)}
                     className="px-5 py-2.5 bg-blue-50 text-[#0a2f64] border border-[#0a2f64]/20 rounded-lg hover:bg-[#0a2f64] hover:text-white font-medium text-sm transition-all whitespace-nowrap"
                   >
                     Analisar TR
                   </button>
                 </div>
               ))}
             </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4 opacity-50" />
              <p className="text-lg">Tudo certo por aqui!</p>
              <p className="text-sm mt-1">Não há Termos de Referência aguardando a sua ação no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListaTermos({ usuarioAtual, termos, navegar }) {
  const getStatusColor = (status) => {
    if (status === 'Rascunho') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (status === 'Concluído (Pronto para Edital)') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
      <div className="p-5 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center rounded-t-xl">
        <h2 className="text-xl font-bold text-[#0a2f64]">Base de Termos de Referência</h2>
        <div className="flex gap-2">
          {usuarioAtual.id === 'demandante' && (
            <button 
              onClick={() => navegar('chat')}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084] shadow-sm font-medium"
            >
              <MessageSquare size={18} /> Novo Termo (IA)
            </button>
          )}
        </div>
      </div>
      
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4">
        <div className="flex flex-1 max-w-md relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por objeto ou número..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white rounded-lg text-slate-700 hover:bg-slate-100">
          <Filter size={18} /> Filtros
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-slate-200 text-sm text-slate-500">
              <th className="p-4 font-semibold uppercase tracking-wider text-xs">Identificador / Objeto</th>
              <th className="p-4 font-semibold uppercase tracking-wider text-xs">Autor</th>
              <th className="p-4 font-semibold uppercase tracking-wider text-xs">Status / Etapa Atual</th>
              <th className="p-4 font-semibold uppercase tracking-wider text-xs">Score IA</th>
              <th className="p-4 font-semibold uppercase tracking-wider text-xs text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {termos.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div className="font-bold text-[#0a2f64] mb-1">{t.id}</div>
                  <div className="text-sm text-slate-700 font-medium line-clamp-1">{t.objeto}</div>
                </td>
                <td className="p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-1"><User size={12}/> {t.autor}</div>
                  <div className="text-xs text-slate-400 mt-1">{t.data}</div>
                </td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-semibold ${getStatusColor(t.status)}`}>
                    {t.status}
                  </span>
                </td>
                <td className="p-4">
                  {t.scoreIA ? (
                    <div className="flex items-center gap-2">
                      <div className={`text-sm font-bold ${t.scoreIA >= 90 ? 'text-emerald-600' : 'text-amber-500'}`}>{t.scoreIA}%</div>
                      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                        <div className={`h-full ${t.scoreIA >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{width: `${t.scoreIA}%`}}></div>
                      </div>
                    </div>
                  ) : <span className="text-slate-400 text-sm font-medium">N/A</span>}
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => navegar('detalhe', t)}
                    className="text-[#0a2f64] hover:text-[#134084] font-semibold text-sm px-3 py-1.5 hover:bg-blue-50 rounded transition-colors"
                  >
                    Ver Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetalheTermo({ usuarioAtual, termo, avancarFluxo, navegar }) {
  if (!termo) return null;

  const confAtual = FLUXO[termo.status];
  const podeAgir = confAtual && confAtual.ator === usuarioAtual.id;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button 
        onClick={() => navegar('lista')}
        className="flex items-center gap-2 text-slate-500 hover:text-[#0a2f64] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={18} /> Voltar para a Base
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel Principal (Esquerda) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold text-[#0a2f64] mb-2">{termo.id}</h1>
                <p className="text-lg text-slate-700 font-medium">{termo.objeto}</p>
              </div>
              <button className="p-2 text-slate-400 hover:text-[#0a2f64] hover:bg-blue-50 rounded-lg transition" title="Exportar PDF">
                <Download size={24} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-y border-slate-100 mb-6 bg-slate-50 rounded-lg px-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Autor</p>
                <p className="font-medium text-slate-800">{termo.autor}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Data Criação</p>
                <p className="font-medium text-slate-800">{termo.data}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Valor Estimado</p>
                <p className="font-bold text-[#0a2f64]">{termo.valor}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Status</p>
                <p className="font-medium text-amber-600">{termo.status}</p>
              </div>
            </div>

            <div className="prose prose-slate max-w-none prose-sm">
              <h3 className="text-lg font-bold text-[#0a2f64] flex items-center gap-2 border-b border-slate-100 pb-2"><FileText size={18}/> Estrutura do Documento</h3>
              <div className="bg-white p-6 rounded-lg border border-slate-200 h-80 overflow-y-auto mt-4 text-slate-700 shadow-inner">
                <div className="text-center mb-6">
                  <img src="/image_33d57b.png" alt="Logo FSPH" className="h-12 mx-auto mb-4 object-contain opacity-50 grayscale" />
                  <p className="font-bold text-lg">FUNDAÇÃO DE SAÚDE PARREIRAS HORTA - FSPH</p>
                  <p className="font-semibold">TERMO DE REFERÊNCIA</p>
                </div>
                <p><strong>1. DO OBJETO</strong><br/>{termo.objeto}, conforme especificações e quantitativos estabelecidos neste Termo de Referência.</p>
                <p className="mt-4"><strong>2. FUNDAMENTAÇÃO E DESCRIÇÃO DA NECESSIDADE</strong><br/>A contratação faz-se necessária para garantir o pleno funcionamento das unidades administradas pela FSPH, em conformidade com o Art. 72 da Lei 14.133/2021...</p>
                <p className="mt-8 text-center text-slate-400 italic">[Final do fragmento visível do documento]</p>
              </div>
            </div>
          </div>
        </div>

        {/* Painel Lateral (Direita) - Ações e IA */}
        <div className="space-y-6">
          {/* Validação IA */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0a2f64] text-white flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Bot size={18} /> Análise IA (Lei 14.133)</h3>
              <span className="text-2xl font-bold text-emerald-400">{termo.scoreIA || '--'}%</span>
            </div>
            <div className="p-5 bg-white">
              {termo.scoreIA ? (
                <ul className="space-y-4 text-sm font-medium">
                  <li className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">Art. 18 (Fase Preparatória) contemplado.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">Art. 23 (Valor Estimado) fundamentado.</span>
                  </li>
                  <li className="flex items-start gap-3 p-3 bg-amber-50 rounded border border-amber-100">
                    <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-amber-800">Sugestão: Detalhar melhor os critérios de sustentabilidade (Art. 11, IV).</span>
                  </li>
                </ul>
              ) : (
                <div className="text-center py-4">
                  <p className="text-slate-500 text-sm mb-3">Documento não analisado pela IA.</p>
                  <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-bold transition">Solicitar Análise</button>
                </div>
              )}
            </div>
          </div>

          {/* Workflow de Aprovação */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-[#0a2f64] mb-5 border-b border-slate-100 pb-2 text-lg">Fluxo de Aprovação</h3>
            
            <div className="space-y-5 mb-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {Object.keys(FLUXO).map((step, idx) => {
                const isCurrent = termo.status === step;
                const isPast = Object.keys(FLUXO).indexOf(termo.status) > idx;
                if(step === 'Rascunho' && termo.status !== 'Rascunho') return null;

                return (
                  <div key={step} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active ${isCurrent ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-40'}`}>
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${isCurrent ? 'border-[#0a2f64] bg-white z-10 scale-125' : isPast ? 'border-emerald-500 bg-emerald-500 text-white z-10' : 'border-slate-300 bg-slate-100 z-10'} shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm transition-transform`}>
                       {isPast && <CheckCircle size={14} />}
                    </div>
                    <div className={`w-[calc(100%-2.5rem)] md:w-[calc(50%-2rem)] text-xs font-bold py-2 px-3 rounded-lg ${isCurrent ? 'bg-blue-50 text-[#0a2f64] border border-blue-100' : 'text-slate-600'}`}>
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>

            {podeAgir ? (
              <div className="pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-3 font-medium text-center">Sua ação é necessária.</p>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => avancarFluxo(termo.id)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow transition flex justify-center items-center gap-2"
                  >
                    <CheckCircle size={18} /> {confAtual.acao}
                  </button>
                  <button className="w-full py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-bold transition text-sm">
                    Devolver para Ajustes
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-slate-200 p-4 bg-amber-50 rounded-lg text-center text-sm border border-amber-100">
                Aguardando ação de:<br/><strong className="text-amber-800 text-base">{SETORES.find(s => s.id === confAtual?.ator)?.nome || 'Concluído'}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatIA({ navegar, setTermos, termos }) {
  const [mensagens, setMensagens] = useState([
    { de: 'ia', texto: 'Olá! Sou o assistente de IA da FSPH treinado na Lei 14.133. Qual é o objeto da contratação que você deseja elaborar hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [etapa, setEtapa] = useState(0);

  const enviarMensagem = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const novaMsgUser = { de: 'user', texto: input };
    setMensagens([...mensagens, novaMsgUser]);
    setInput('');

    setTimeout(() => {
      let respostaIA = '';
      if (etapa === 0) {
        respostaIA = `Entendido. Para "${novaMsgUser.texto}", qual o valor estimado da contratação e o prazo de vigência?`;
        setEtapa(1);
      } else if (etapa === 1) {
        respostaIA = `Perfeito. Com base nessas informações, estou estruturando as 7 seções obrigatórias conforme o Art. 6º, XXIII. Deseja incluir critérios específicos de sustentabilidade?`;
        setEtapa(2);
      } else {
        respostaIA = `Estrutura gerada com sucesso! O Termo de Referência foi criado em Rascunho e analisado contra a Lei 14.133.`;
        const novoTR = {
          id: `TR-2023-00${termos.length + 1}`,
          objeto: mensagens[1]?.texto || 'Novo Objeto via IA',
          autor: 'Área Demandante',
          data: new Date().toLocaleDateString('pt-BR'),
          status: 'Rascunho',
          valor: 'A definir',
          scoreIA: 98
        };
        setTermos([novoTR, ...termos]);
        setEtapa(3);
      }
      setMensagens(prev => [...prev, { de: 'ia', texto: respostaIA }]);
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 bg-[#0a2f64] flex justify-between items-center rounded-t-xl text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg"><Bot size={20} /></div>
          <div>
            <h3 className="font-bold text-lg">Assistente IA de Elaboração</h3>
            <p className="text-xs text-blue-200">Geração guiada baseada na Lei 14.133/2021</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'ia' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${m.de === 'ia' ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100' : 'bg-[#0a2f64] text-white rounded-tr-none'}`}>
              <p className="text-sm font-medium leading-relaxed">{m.texto}</p>
            </div>
          </div>
        ))}
        {etapa === 3 && (
          <div className="flex justify-center mt-6">
            <button 
              onClick={() => navegar('lista')}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 shadow-lg transition transform hover:scale-105 flex items-center gap-2"
            >
              <FileText size={18}/> Visualizar Documento Gerado
            </button>
          </div>
        )}
      </div>

      <form onSubmit={enviarMensagem} className="p-4 border-t border-slate-200 bg-white rounded-b-xl flex gap-3">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={etapa === 3}
          placeholder="Digite sua resposta aqui..." 
          className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] disabled:bg-slate-100 font-medium text-slate-700"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || etapa === 3}
          className="p-3 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

function AnaliseUpload({ navegar }) {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(false);

  const simularUpload = () => {
    setAnalisando(true);
    setTimeout(() => {
      setAnalisando(false);
      setResultado(true);
    }, 2500);
  };

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <div className="bg-white p-10 rounded-xl shadow-sm border border-slate-200 text-center">
        {!analisando && !resultado ? (
          <>
            <div className="w-24 h-24 bg-blue-50 text-[#0a2f64] rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
              <Upload size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#0a2f64] mb-3">Validação de Documento</h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto font-medium">
              Faça o upload do seu Termo de Referência (.doc, .docx ou .pdf). O motor de NLP extrairá o texto e validará contra os critérios da Lei 14.133.
            </p>
            
            <div 
              className="border-2 border-dashed border-[#0a2f64]/30 bg-slate-50 rounded-xl p-12 cursor-pointer hover:bg-blue-50 hover:border-[#0a2f64] transition-all group"
              onClick={simularUpload}
            >
              <FileText size={48} className="mx-auto text-slate-300 group-hover:text-[#0a2f64] mb-4 transition-colors" />
              <p className="text-[#0a2f64] font-bold text-lg">Clique aqui ou arraste o arquivo</p>
              <p className="text-sm text-slate-500 mt-2 font-medium">Suporta DOC, DOCX e PDF (Máx. 10MB)</p>
            </div>
          </>
        ) : analisando ? (
          <div className="py-24">
            <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-[#0a2f64] mx-auto mb-8"></div>
            <h3 className="text-2xl font-bold text-[#0a2f64]">Processando via NLP e IA...</h3>
            <p className="text-slate-500 mt-3 font-medium text-lg">Extraindo seções e validando artigos da lei.</p>
          </div>
        ) : (
          <div className="py-10">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-3xl font-bold text-[#0a2f64] mb-2">Análise Concluída!</h2>
            <div className="bg-white p-8 rounded-xl text-left mt-8 mb-8 border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <span className="font-bold text-slate-700 text-lg">Score de Conformidade:</span>
                <span className="text-3xl font-bold text-amber-500">76%</span>
              </div>
              <ul className="space-y-4 text-base font-medium">
                 <li className="flex gap-3 items-center"><CheckCircle className="text-emerald-500 shrink-0" size={20}/> Art. 6º, XXIII: Todas as seções estruturais encontradas.</li>
                 <li className="flex gap-3 items-center"><AlertTriangle className="text-amber-500 shrink-0" size={20}/> Alerta: Modelo de precificação não está claro.</li>
                 <li className="flex gap-3 items-center"><div className="w-5 h-5 rounded-full bg-red-500 shrink-0 flex items-center justify-center text-white text-xs font-bold">X</div> Reprovado: Faltam cláusulas de sanções administrativas.</li>
              </ul>
            </div>
            <button 
              onClick={() => navegar('lista')}
              className="px-8 py-3 bg-[#0a2f64] text-white font-bold rounded-lg hover:bg-[#134084] shadow-md transition text-lg w-full max-w-sm"
            >
              Salvar Termo na Base
            </button>
          </div>
        )}
      </div>
    </div>
  );
}