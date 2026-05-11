import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Clock, CheckCircle, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ETAPAS, modalColor, statusColor } from '../../constants';
import { getDashboardStats, getPendentes } from '../../services/api';
import type { DashboardStats, TermResponse, TelaId } from '../../types';

interface DashboardViewProps {
  navegar: (tela: TelaId, termoId?: string) => void;
}

export default function DashboardView({ navegar }: DashboardViewProps) {
  const { usuario } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendentes, setPendentes] = useState<TermResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, pendentesData] = await Promise.all([
        getDashboardStats(),
        getPendentes(),
      ]);
      setStats(statsData);
      setPendentes(pendentesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!usuario) return null;

  if (loading) {
    return (
      <div className="space-y-5 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-24" />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-32" />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-48" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <AlertTriangle size={36} className="mx-auto text-red-400 mb-3" />
          <p className="text-slate-700 font-semibold mb-1">Falha ao carregar o painel</p>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-[#0a2f64] text-white rounded-lg text-sm font-bold hover:bg-[#134084] transition">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const emTramitacao = Object.entries(stats.por_status)
    .filter(([s]) => s !== 'Rascunho' && s !== 'Homologado')
    .reduce((acc, [, n]) => acc + n, 0);

  const cards = [
    { label: 'Total de Processos',  val: stats.total,                                 cor: 'text-[#0a2f64]',    bg: 'bg-blue-50',    Icon: FileText },
    { label: 'Pendentes Comigo',    val: pendentes.length,                             cor: 'text-amber-600',    bg: 'bg-amber-50',   Icon: Clock },
    { label: 'Em Tramitacao',       val: emTramitacao,                                cor: 'text-violet-600',   bg: 'bg-violet-50',  Icon: ChevronRight },
    { label: 'Homologados',         val: stats.por_status['Homologado'] ?? 0,          cor: 'text-emerald-600',  bg: 'bg-emerald-50', Icon: CheckCircle },
  ];

  const formatValue = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

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

      {/* Distribuicao por etapa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-[#0a2f64] text-sm mb-3">Distribuicao por Etapa do Fluxo COLIC</h3>
        <div className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa, i) => {
            const count = stats.por_status[etapa] ?? 0;
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

      {/* Requer Sua Acao */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-[#0a2f64] flex items-center gap-2 text-sm">
            <AlertTriangle className="text-amber-500" size={17} />
            Requer Sua Acao — {usuario.nome} ({pendentes.length})
          </h3>
          <button onClick={() => navegar('lista')} className="text-xs text-[#0a2f64] hover:underline font-medium">Ver todos →</button>
        </div>
        {pendentes.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {pendentes.map(term => (
              <div key={term.id} className="p-4 hover:bg-slate-50 flex items-center justify-between gap-4 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-slate-800 text-sm">{term.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${modalColor(term.category)}`}>{term.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{formatValue(term.estimated_value)}</p>
                </div>
                <button onClick={() => navegar('detalhe', term.id)}
                  className="px-4 py-2 bg-[#0a2f64] text-white rounded-lg text-xs font-bold hover:bg-[#134084] transition shrink-0">
                  Analisar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-slate-400">
            <CheckCircle size={36} className="mx-auto text-emerald-400 mb-2 opacity-60" />
            <p className="text-sm">Nenhum processo aguardando sua acao.</p>
          </div>
        )}
      </div>

      {/* Processos Recentes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-[#0a2f64] text-sm">Processos Recentes</h3>
        </div>
        {stats.recent_terms.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Processo</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent_terms.map(term => (
                  <tr
                    key={term.id}
                    onClick={() => navegar('detalhe', term.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 truncate max-w-[200px]">{term.title}</p>
                      <p className="text-slate-400 font-mono">{term.id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded font-semibold ${modalColor(term.category)}`}>{term.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded border font-semibold ${statusColor(term.status)}`}>{term.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(term.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">
            Nenhum processo recente.
          </div>
        )}
      </div>
    </div>
  );
}
