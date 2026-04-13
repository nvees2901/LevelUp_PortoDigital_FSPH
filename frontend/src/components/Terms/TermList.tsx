import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Filter, User, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTerms } from '../../services/api';
import type { TermoMock, TermSummary, TelaId } from '../../types';

interface TermListProps {
  termos: TermoMock[];
  navegar: (tela: TelaId, termo?: TermoMock) => void;
}

function getStatusColor(status: string): string {
  if (status === 'Rascunho' || status === 'rascunho') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (status === 'Concluído (Pronto para Edital)' || status === 'validado') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'reprovado') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    rascunho: 'Rascunho',
    em_analise: 'Em Análise',
    validado: 'Validado',
    reprovado: 'Reprovado',
  };
  return map[status] || status;
}

export default function TermList({ termos: termosMock, navegar }: TermListProps) {
  const { usuario } = useAuth();
  const [busca, setBusca] = useState('');
  const [apiTerms, setApiTerms] = useState<TermSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiConnected, setApiConnected] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const fetchTerms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTerms({
        page,
        limit: 10,
        search: busca.trim() || undefined,
      });
      setApiTerms(data.items);
      setTotalPages(data.pages);
      setApiConnected(true);
    } catch {
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  }, [page, busca]);

  useEffect(() => {
    const timeout = setTimeout(fetchTerms, busca ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchTerms, busca]);

  // Dados a exibir: API ou mock
  const termosFiltrados = apiConnected
    ? [] // Usa apiTerms abaixo
    : busca.trim()
      ? termosMock.filter(
          (t) =>
            t.id.toLowerCase().includes(busca.toLowerCase()) ||
            t.objeto.toLowerCase().includes(busca.toLowerCase())
        )
      : termosMock;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
      <div className="p-5 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center rounded-t-xl">
        <h2 className="text-xl font-bold text-[#0a2f64]">Base de Termos de Referência</h2>
        <div className="flex gap-2">
          {usuario?.id === 'demandante' && (
            <button
              onClick={() => navegar('chat')}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084] shadow-sm font-medium"
            >
              <MessageSquare size={18} /> Novo Termo (IA)
            </button>
          )}
        </div>
      </div>

      {/* Indicador API */}
      {!loading && !apiConnected && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          Backend não disponível — exibindo dados locais.
        </div>
      )}

      <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4">
        <div className="flex flex-1 max-w-md relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por objeto ou número..."
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white rounded-lg text-slate-700 hover:bg-slate-100">
          <Filter size={18} /> Filtros
        </button>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 size={32} className="animate-spin text-[#0a2f64] mx-auto mb-3" />
            <p className="text-slate-500">Carregando termos...</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-200 text-sm text-slate-500">
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Identificador / Objeto</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Categoria</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Status</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Valor Estimado</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiConnected ? (
                apiTerms.length > 0 ? apiTerms.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-[#0a2f64] mb-1 text-xs">{t.id.slice(0, 8)}...</div>
                      <div className="text-sm text-slate-700 font-medium line-clamp-1">{t.title}</div>
                      {t.original_filename && (
                        <div className="text-xs text-slate-400 mt-1">{t.original_filename}</div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-600 capitalize">{t.category.replace('_', ' ')}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-semibold ${getStatusColor(t.status)}`}>
                        {formatStatus(t.status)}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">
                      {t.estimated_value ? `R$ ${Number(t.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => navegar('detalhe', {
                          id: t.id,
                          objeto: t.title,
                          autor: '-',
                          data: new Date(t.created_at).toLocaleDateString('pt-BR'),
                          status: t.status === 'rascunho' ? 'Rascunho' : formatStatus(t.status),
                          valor: t.estimated_value ? `R$ ${Number(t.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/A',
                          scoreIA: null,
                        })}
                        className="text-[#0a2f64] hover:text-[#134084] font-semibold text-sm px-3 py-1.5 hover:bg-blue-50 rounded transition-colors"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-500">
                      Nenhum termo encontrado.
                    </td>
                  </tr>
                )
              ) : (
                termosFiltrados.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-[#0a2f64] mb-1">{t.id}</div>
                      <div className="text-sm text-slate-700 font-medium line-clamp-1">{t.objeto}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1"><User size={12} /> {t.autor}</div>
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
                            <div className={`h-full ${t.scoreIA >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${t.scoreIA}%` }}></div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm font-medium">N/A</span>
                      )}
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
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação — só quando API conectada */}
      {apiConnected && totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
