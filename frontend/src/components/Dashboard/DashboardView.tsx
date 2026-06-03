import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Clock, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { modalColor, categoryLabel } from '../../constants';
import { getDashboardStats } from '../../services/api';
import type { DashboardStats, TelaId } from '../../types';
import { formatDate } from '../../utils';

interface DashboardViewProps {
  navegar: (tela: TelaId, termoId?: string) => void;
}

export default function DashboardView({ navegar }: DashboardViewProps) {
  const { usuario } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statsData = await getDashboardStats();
      setStats(statsData);
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
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-24" />
          ))}
        </div>
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
            className="px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Total de Processos', val: stats.total,               cor: 'text-brand-primary', bg: 'bg-blue-50',  Icon: FileText },
    { label: 'Processos Recentes', val: stats.recent_terms.length, cor: 'text-violet-600',    bg: 'bg-violet-50', Icon: Clock },
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <p className="section-title">Painel</p>
        <h1 className="text-xl font-black text-brand-primary">
          Olá, {usuario.nomeUsuarioLogado?.split(' ')[0] ?? 'usuário'}
        </h1>
      </div>
      {/* Cards */}
      <div className="grid grid-cols-2 gap-4">
        {cards.map(c => (
          <div key={c.label} className="card card-hover p-4">
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

      {/* Processos Recentes */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-brand-primary text-sm">Processos Recentes</h3>
          <button onClick={() => navegar('lista')} className="text-xs text-brand-primary hover:underline font-medium">Ver todos →</button>
        </div>
        {stats.recent_terms.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Processo</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
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
                      <span className={`px-2 py-0.5 rounded font-semibold ${modalColor(term.category)}`}>{categoryLabel(term.category)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(term.created_at)}
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
