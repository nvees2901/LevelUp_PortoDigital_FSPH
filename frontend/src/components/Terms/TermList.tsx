import { useState, useEffect } from 'react';
import { Search, Bot, FileSearch, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { modalColor } from '../../constants';
import { getTerms } from '../../services/api';
import type { TermSummary, TermListResponse, TelaId } from '../../types';
import { formatCurrency } from '../../utils';

interface TermListProps {
  navegar: (tela: TelaId, termoId?: string) => void;
}

const CATEGORIES = ['capacitacao', 'aquisicao', 'servico_tecnico', 'outro'] as const;

export default function TermList({ navegar }: TermListProps) {
  const { usuario } = useAuth();
  const [data, setData] = useState<TermListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');

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
    return matchBusca && matchCategoria;
  });

  return (
    <div className="animate-fade-in space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="section-title">Processos de Contratação</h2>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe e gerencie os processos de contratação da instituição.
          </p>
        </div>
        {usuario?.id === 'demandante' && (
          <button
            onClick={() => navegar('chat')}
            className="btn btn-primary btn-md"
          >
            <Bot size={16} /> Novo Processo via IA
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Filtros */}
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título ou ID..."
              className="input input-icon"
            />
          </div>
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            className="input sm:w-56"
          >
            {categoryOpts.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-12 flex-1" />
                <div className="skeleton hidden h-12 w-28 sm:block" />
                <div className="skeleton hidden h-12 w-32 md:block" />
                <div className="skeleton h-12 w-28" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
              <AlertCircle size={26} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700">Não foi possível carregar</p>
            <p className="mt-1 max-w-xs text-sm text-slate-400">{error}</p>
            <button
              onClick={fetchTerms}
              className="btn btn-secondary btn-sm mt-5"
            >
              Tentar novamente
            </button>
          </div>
        ) : lista.length === 0 ? (
          <div className="empty-state">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <FileSearch size={26} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700">Nenhum processo encontrado</p>
            <p className="mt-1 max-w-xs text-sm text-slate-400">
              Ajuste a busca ou os filtros de categoria para encontrar o que procura.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-wider text-slate-500">
                  {['Processo / Objeto', 'Categoria', 'Valor Estimado', 'Ação'].map((h, i) => (
                    <th key={h} className={`px-5 py-3.5 font-semibold ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(term => (
                  <tr
                    key={term.id}
                    className="border-b border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-brand-50/50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-slate-400">
                        {term.id.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-brand-primary">{term.title}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`badge ${modalColor(term.category)}`}>
                        {term.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-700">
                      {formatCurrency(term.estimated_value)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => navegar('detalhe', term.id)}
                        className="btn btn-ghost btn-sm"
                      >
                        Ver Detalhes <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
