import { useState } from 'react';
import { Search, Bot } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DADOS_INICIAIS, ETAPAS, statusColor, modalColor, COLORS } from '../../constants';
import type { TermoMock, TelaId } from '../../types';

interface TermListProps {
  navegar: (tela: TelaId, termo?: TermoMock) => void;
}

export default function TermList({ navegar }: TermListProps) {
  const { usuario } = useAuth();
  const [termos] = useState<TermoMock[]>(DADOS_INICIAIS);
  const [busca, setBusca] = useState('');
  const [filtroMod, setFiltroMod] = useState('Todas');
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
        <h2 className="text-base font-bold text-[#0a2f64]">Processos de Contratacao</h2>
        {usuario?.id === 'demandante' && (
          <button onClick={() => navegar('chat')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm hover:bg-[#134084] transition"
            style={{ backgroundColor: COLORS.primary }}>
            <Bot size={15} /> Novo Processo via IA
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por objeto, numero ou unidade..."
            className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
        </div>
        <select value={filtroMod} onChange={e => setFiltroMod(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]">
          {['Todas', 'Licitacao', 'Dispensa', 'Inexigibilidade'].map(m => <option key={m}>{m}</option>)}
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
              {['Processo / Objeto', 'Unidade', 'Modalidade', 'Status', 'Score IA', 'Acao'].map((h, i) => (
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
