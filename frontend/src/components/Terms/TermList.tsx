import { useState, useEffect } from 'react';
import { Search, Bot } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ETAPAS, statusColor, modalColor, COLORS } from '../../constants';
import { getTerms } from '../../services/api';
import type { TermSummary, TermListResponse, TelaId } from '../../types';

interface TermListProps {
  navegar: (tela: TelaId, termoId?: string) => void;
}

const CATEGORIES = ['capacitacao', 'aquisicao', 'servico_tecnico', 'outro'] as const;

function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function TermList({ navegar }: TermListProps) {
  const { usuario } = useAuth();
  const [data, setData] = useState<TermListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroStatus, setFiltroStatus] = useState('Todos');

  const statusOpts = ['Todos', ...ETAPAS];
  const categoryOpts = ['Todas', ...CATEGORIES];

  function fetchTerms() {
    setLoading(true);
    setError(null);
    getTerms({ limit: 100 })
      .then(res => { setData(res); setLoading(false); })
      .catch(err => { setError(err.message || 'Erro ao carregar processos.'); setLoading(false); });
  }

  useEffect(() => { fetchTerms(); }, []);

  const items: TermSummary[] = data?.items ?? [];

  const lista = items.filter(term => {
    const q = busca.toLowerCase();
    const matchBusca =
      term.title.toLowerCase().includes(q) ||
      term.id.toLowerCase().includes(q);
    const matchCategoria = filtroCategoria === 'Todas' || term.category === filtroCategoria;
    const matchStatus = filtroStatus === 'Todos' || term.status === filtroStatus;
    return matchBusca && matchCategoria && matchStatus;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
        <h2 className="text-base font-bold text-[#0a2f64]">Processos de Contratacao</h2>
        {usuario?.id === 'demandante' && (
          <button
            onClick={() => navegar('chat')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm hover:bg-[#134084] transition"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Bot size={15} /> Novo Processo via IA
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por titulo ou ID..."
            className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
        >
          {categoryOpts.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
        >
          {statusOpts.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Conteudo */}
      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="flex-1 h-10 bg-slate-100 rounded" />
              <div className="w-24 h-10 bg-slate-100 rounded" />
              <div className="w-32 h-10 bg-slate-100 rounded" />
              <div className="w-28 h-10 bg-slate-100 rounded" />
              <div className="w-20 h-10 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-10 text-center">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button
            onClick={fetchTerms}
            className="px-4 py-2 text-sm font-bold text-white rounded-lg"
            style={{ backgroundColor: COLORS.primary }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                {['Processo / Objeto', 'Categoria', 'Status', 'Valor Estimado', 'Acao'].map((h, i) => (
                  <th key={h} className={`p-4 font-semibold ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map(term => (
                <tr key={term.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-[#0a2f64] text-sm font-mono">
                      {term.id.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-slate-700 mt-0.5">{term.title}</p>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(term.category)}`}>
                      {term.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-semibold ${statusColor(term.status)}`}>
                      {term.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-700">
                    {formatCurrency(term.estimated_value)}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => navegar('detalhe', term.id)}
                      className="text-[#0a2f64] hover:bg-blue-50 font-bold text-xs px-3 py-1.5 rounded transition-colors border border-transparent hover:border-blue-200"
                    >
                      Ver Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">
              Nenhum processo encontrado para os filtros aplicados.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
