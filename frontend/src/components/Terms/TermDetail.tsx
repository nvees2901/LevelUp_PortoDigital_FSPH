import { useState, useEffect } from 'react';
import {
  ArrowLeft, FileText, Download, Bot,
  CheckCircle, AlertTriangle, Loader2, XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SETORES } from '../../constants';
import { getTerm, getAnalysesByTerm, getAnalysis, exportTermPdf, analyzeTerm, updateTerm } from '../../services/api';
import type { TermSummary, TelaId, TermResponse, AnalysisResponse, CriterionResult } from '../../types';

interface TermDetailProps {
  termo: TermSummary | null;
  navegar: (tela: TelaId, termo?: TermSummary) => void;
}

function statusIcon(status: string) {
  if (status === 'aprovado') return <CheckCircle size={16} className="text-emerald-500 shrink-0" />;
  if (status === 'alerta') return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
  return <XCircle size={16} className="text-red-500 shrink-0" />;
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

const STATUS_FLOW: Record<string, string> = {
  rascunho: 'em_analise',
  em_analise: 'validado',
};

const STATUS_ACTIONS: Record<string, string> = {
  rascunho: 'Enviar para Análise',
  em_analise: 'Aprovar e Validar',
};

export default function TermDetail({ termo, navegar }: TermDetailProps) {
  const { usuario } = useAuth();
  const [termData, setTermData] = useState<TermResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!termo) return;
    const termoId = termo.id;
    let cancelled = false;

    async function fetchData() {
      try {
        const [termResp, analyses] = await Promise.all([
          getTerm(termoId),
          getAnalysesByTerm(termoId).catch(() => []),
        ]);

        if (cancelled) return;
        setTermData(termResp);

        if (Array.isArray(analyses) && analyses.length > 0) {
          const latest = analyses[0];
          if (latest?.id) {
            const full = await getAnalysis(latest.id).catch(() => null);
            if (!cancelled && full) setAnalysis(full);
          }
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar os detalhes do termo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    fetchData();
    return () => { cancelled = true; };
  }, [termo]);

  if (!termo || !usuario) return null;

  const currentStatus = termData?.status ?? termo.status;
  const nextStatus = STATUS_FLOW[currentStatus];
  const actionLabel = STATUS_ACTIONS[currentStatus];

  const handleExportPdf = async () => {
    try {
      const blob = await exportTermPdf(termo.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TR_${termo.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao exportar PDF. Verifique se o backend está rodando.');
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeTerm(termo.id);
      setAnalysis(result);
    } catch {
      alert('Erro ao solicitar análise. Verifique se o backend está rodando.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAdvance = async () => {
    if (!nextStatus) return;
    setAdvancing(true);
    try {
      const updated = await updateTerm(termo.id, { status: nextStatus });
      setTermData(updated);
    } catch {
      alert('Erro ao avançar o status. Verifique se o backend está rodando.');
    } finally {
      setAdvancing(false);
    }
  };

  const displayTitle = termData?.title ?? termo.title;
  const displayContent = termData?.content;
  const sections = termData?.sections;
  const score = analysis?.compliance_score;
  const criteria = analysis?.criteria_results;
  const estimatedValue = termData?.estimated_value ?? termo.estimated_value;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button
        onClick={() => navegar('lista')}
        className="flex items-center gap-2 text-slate-500 hover:text-[#0a2f64] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={18} /> Voltar para a Base
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2 mb-6">
          <XCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center">
          <Loader2 size={32} className="animate-spin text-[#0a2f64] mx-auto mb-3" />
          <p className="text-slate-500">Carregando detalhes do termo...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel Principal */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-[#0a2f64] mb-2">{termo.id.slice(0, 8)}...</h1>
                  <p className="text-lg text-slate-700 font-medium">{displayTitle}</p>
                </div>
                <button
                  onClick={handleExportPdf}
                  className="p-2 text-slate-400 hover:text-[#0a2f64] hover:bg-blue-50 rounded-lg transition"
                  title="Exportar PDF"
                >
                  <Download size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-y border-slate-100 mb-6 bg-slate-50 rounded-lg px-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Categoria</p>
                  <p className="font-medium text-slate-800 capitalize">{(termData?.category ?? termo.category).replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Data Criação</p>
                  <p className="font-medium text-slate-800">{new Date(termData?.created_at ?? termo.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Valor Estimado</p>
                  <p className="font-bold text-[#0a2f64]">
                    {estimatedValue ? `R$ ${Number(estimatedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Status</p>
                  <p className="font-medium text-amber-600">{formatStatus(currentStatus)}</p>
                </div>
              </div>

              <div className="prose prose-slate max-w-none prose-sm">
                <h3 className="text-lg font-bold text-[#0a2f64] flex items-center gap-2 border-b border-slate-100 pb-2">
                  <FileText size={18} /> Estrutura do Documento
                </h3>
                <div className="bg-white p-6 rounded-lg border border-slate-200 h-80 overflow-y-auto mt-4 text-slate-700 shadow-inner">
                  {displayContent ? (
                    <div className="whitespace-pre-wrap text-sm">{displayContent.slice(0, 5000)}</div>
                  ) : sections ? (
                    <div className="space-y-4">
                      {Object.entries(sections).map(([key, val]) => (
                        <div key={key}>
                          <strong className="uppercase text-[#0a2f64]">{key.replace(/_/g, ' ')}</strong>
                          <p className="text-sm mt-1">{val ? 'Seção detectada' : 'Não encontrada'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      <p>Conteúdo do documento não disponível.</p>
                      <p className="text-sm mt-1">Faça upload de um documento ou gere via assistente IA.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Painel Lateral */}
          <div className="space-y-6">
            {/* Validação IA */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-[#0a2f64] text-white flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Bot size={18} /> Análise IA (Lei 14.133)</h3>
                <span className="text-2xl font-bold text-emerald-400">{score != null ? `${score}%` : '--'}</span>
              </div>
              <div className="p-5 bg-white">
                {criteria && criteria.length > 0 ? (
                  <ul className="space-y-3 text-sm font-medium max-h-64 overflow-y-auto">
                    {criteria.map((c: CriterionResult) => (
                      <li
                        key={c.criterio}
                        className={`flex items-start gap-2 p-2 rounded ${
                          c.status === 'reprovado' ? 'bg-red-50 border border-red-100' :
                          c.status === 'alerta' ? 'bg-amber-50 border border-amber-100' : ''
                        }`}
                      >
                        {statusIcon(c.status)}
                        <div>
                          <span className="text-slate-700">{c.artigo}: {c.descricao}</span>
                          <span className="ml-1 text-xs text-slate-400">({c.score}/10)</span>
                          {c.sugestao && (
                            <p className="text-xs text-slate-500 mt-1">{c.sugestao}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-500 text-sm mb-3">Documento não analisado pela IA.</p>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-bold transition disabled:opacity-50"
                    >
                      {analyzing ? (
                        <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Analisando...</span>
                      ) : (
                        'Solicitar Análise'
                      )}
                    </button>
                  </div>
                )}

                {analysis && analysis.suggestions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Sugestões de Melhoria</p>
                    <ul className="space-y-2">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-slate-600 flex gap-2">
                          <span className="bg-[#0a2f64] text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">
                            {s.prioridade}
                          </span>
                          <span>{s.artigo} — {s.descricao}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-[#0a2f64] mb-5 border-b border-slate-100 pb-2 text-lg">Status do Processo</h3>

              <div className="space-y-3 mb-6">
                {['rascunho', 'em_analise', 'validado', 'reprovado'].map((step) => {
                  const isCurrent = currentStatus === step;
                  const isPast = ['rascunho', 'em_analise', 'validado', 'reprovado'].indexOf(currentStatus) >
                    ['rascunho', 'em_analise', 'validado', 'reprovado'].indexOf(step);

                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 p-2 rounded ${
                        isCurrent ? 'bg-blue-50 border border-blue-100' : ''
                      } ${isPast ? 'opacity-60' : ''} ${!isCurrent && !isPast ? 'opacity-40' : ''}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isCurrent ? 'border-[#0a2f64] bg-white' :
                          isPast ? 'border-emerald-500 bg-emerald-500 text-white' :
                          'border-slate-300 bg-slate-100'
                        }`}
                      >
                        {isPast && <CheckCircle size={14} />}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{formatStatus(step)}</span>
                    </div>
                  );
                })}
              </div>

              {nextStatus && actionLabel ? (
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600 mb-3 font-medium text-center">Sua ação é necessária.</p>
                  <button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow transition flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {advancing ? (
                      <><Loader2 size={18} className="animate-spin" /> Processando...</>
                    ) : (
                      <><CheckCircle size={18} /> {actionLabel}</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="pt-4 p-4 bg-emerald-50 rounded-lg text-center text-sm border border-emerald-100">
                  <strong className="text-emerald-800 text-base">
                    {currentStatus === 'validado' ? 'Termo Validado' :
                     currentStatus === 'reprovado' ? 'Termo Reprovado' : 'Processo Concluído'}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
