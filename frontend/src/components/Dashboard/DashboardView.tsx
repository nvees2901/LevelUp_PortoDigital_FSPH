import { useState, useEffect } from 'react';
import {
  FileText, Clock, CheckCircle, ChevronRight,
  AlertTriangle, PieChart, Loader2, XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardStats } from '../../services/api';
import type { TermSummary, TelaId, DashboardStats } from '../../types';

interface DashboardViewProps {
  navegar: (tela: TelaId, termo?: TermSummary) => void;
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

export default function DashboardView({ navegar }: DashboardViewProps) {
  const { usuario } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const data = await getDashboardStats();
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Não foi possível conectar ao backend.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (!usuario) return null;

  const pendentes = stats?.recent_terms.filter((t) => t.status === 'em_analise' || t.status === 'rascunho') ?? [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <XCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Total de TRs</p>
              <h3 className="text-3xl font-bold text-[#0a2f64]">
                {loading ? <Loader2 size={24} className="animate-spin" /> : (stats?.total ?? 0)}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-[#0a2f64] rounded-lg"><FileText size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Em Análise</p>
              <h3 className="text-3xl font-bold text-amber-600">
                {loading ? <Loader2 size={24} className="animate-spin" /> : (stats?.em_analise ?? 0)}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Clock size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Validados (Lei 14.133)</p>
              <h3 className="text-3xl font-bold text-emerald-600">
                {loading ? <Loader2 size={24} className="animate-spin" /> : (stats?.validados ?? 0)}
              </h3>
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

      {stats && stats.conformidade_media > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-[#0a2f64] rounded-lg"><PieChart size={24} /></div>
          <div>
            <p className="text-slate-500 text-sm font-medium">Conformidade Média (Lei 14.133/2021)</p>
            <p className="text-2xl font-bold text-[#0a2f64]">{stats.conformidade_media.toFixed(1)}%</p>
          </div>
          <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden ml-4">
            <div
              className={`h-full rounded-full ${stats.conformidade_media >= 80 ? 'bg-emerald-500' : stats.conformidade_media >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${stats.conformidade_media}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center">
          <h3 className="font-bold text-[#0a2f64] flex items-center gap-2 text-lg">
            <AlertTriangle className="text-amber-500" size={22} />
            Termos Recentes ({usuario.nome})
          </h3>
        </div>
        <div className="p-0 bg-slate-50">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 size={32} className="animate-spin text-[#0a2f64] mx-auto mb-3" />
              <p className="text-slate-500">Carregando...</p>
            </div>
          ) : pendentes.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {pendentes.map((t) => (
                <div key={t.id} className="p-5 hover:bg-white flex flex-col md:flex-row md:items-center justify-between transition-colors gap-4">
                  <div>
                    <p className="font-semibold text-slate-800 text-lg">{t.id.slice(0, 8)}... — {t.title}</p>
                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                      <PieChart size={14} /> Valor Est.: <span className="font-medium text-slate-700">
                        {t.estimated_value ? `R$ ${Number(t.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/A'}
                      </span>
                      <span className="text-slate-300">|</span>
                      Status: <span className="font-medium text-slate-700">{formatStatus(t.status)}</span>
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
              <p className="text-sm mt-1">Não há Termos de Referência pendentes no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
