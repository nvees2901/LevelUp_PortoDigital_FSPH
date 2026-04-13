import { useState, useEffect } from 'react';
import {
  FileText, Clock, CheckCircle, ChevronRight, AlertTriangle, PieChart,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FLUXO, ETAPAS, DADOS_INICIAIS, modalColor } from '../../constants';
import type { TermoMock, TelaId } from '../../types';

interface DashboardViewProps {
  navegar: (tela: TelaId, termo?: TermoMock) => void;
}

export default function DashboardView({ navegar }: DashboardViewProps) {
  const { usuario } = useAuth();
  const [termos] = useState<TermoMock[]>(DADOS_INICIAIS);

  if (!usuario) return null;

  const pendentes = termos.filter(t => FLUXO[t.status]?.ator === usuario.id);
  const emTramit = termos.filter(t => t.status !== 'Rascunho' && t.status !== 'Homologado').length;
  const homologados = termos.filter(t => t.status === 'Homologado').length;

  const cards = [
    { label: 'Total de Processos', val: termos.length, cor: 'text-[#0a2f64]', bg: 'bg-blue-50', Icon: FileText },
    { label: 'Pendentes Comigo', val: pendentes.length, cor: 'text-amber-600', bg: 'bg-amber-50', Icon: Clock },
    { label: 'Em Tramitacao', val: emTramit, cor: 'text-violet-600', bg: 'bg-violet-50', Icon: ChevronRight },
    { label: 'Homologados', val: homologados, cor: 'text-emerald-600', bg: 'bg-emerald-50', Icon: CheckCircle },
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

      {/* Distribuicao por etapa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-[#0a2f64] text-sm mb-3">Distribuicao por Etapa do Fluxo COLIC</h3>
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
            Requer Sua Acao — {usuario.nome} ({pendentes.length})
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
            <p className="text-sm">Nenhum processo aguardando sua acao.</p>
          </div>
        )}
      </div>
    </div>
  );
}
