import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle, X, Download, Bot, AlertTriangle, FileCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  FLUXO, ETAPAS, CHECKLIST, SETORES, COLORS, statusColor, modalColor,
} from '../../constants';
import {
  getTerm,
  getAnalysesByTerm,
  getChecklist,
  getHistorico,
  analyzeTerm,
  exportTermPdf,
  avancarTermo,
  devolverTermo,
} from '../../services/api';
import type {
  TermResponse,
  AnalysisResponse,
  TermChecklistOut,
  WorkflowEventOut,
  TelaId,
} from '../../types';

interface TermDetailProps {
  termId: string | null;
  navegar: (tela: TelaId, termoId?: string) => void;
}

export default function TermDetail({ termId, navegar }: TermDetailProps) {
  const { usuario } = useAuth();

  const [term, setTerm] = useState<TermResponse | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResponse[]>([]);
  const [checklistData, setChecklistData] = useState<TermChecklistOut | null>(null);
  const [historico, setHistorico] = useState<WorkflowEventOut[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingIA, setAnalyzingIA] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const [termData, analysesData, checklistRaw, historicoData] = await Promise.all([
        getTerm(termId),
        getAnalysesByTerm(termId),
        getChecklist(termId),
        getHistorico(termId),
      ]);
      setTerm(termData);
      setAnalyses(analysesData);
      setChecklistData(checklistRaw);
      setHistorico(historicoData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do processo.');
    } finally {
      setLoading(false);
    }
  }, [termId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!termId || !usuario) return null;

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto pb-10 animate-pulse">
        <div className="h-5 w-40 bg-slate-200 rounded mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-64" />
          </div>
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-48" />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-80" />
          </div>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <button
          onClick={() => navegar('lista')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-[#0a2f64] mb-5 text-sm font-medium transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para Processos
        </button>
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <AlertTriangle size={36} className="mx-auto text-red-400 mb-3" />
          <p className="text-slate-700 font-semibold mb-1">Falha ao carregar o processo</p>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-[#0a2f64] text-white rounded-lg text-sm font-bold hover:bg-[#134084] transition"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!term) return null;

  // --- Derived values ---
  const conf = FLUXO[term.status];
  const podeAgir = conf?.ator != null && conf.ator === usuario.id;
  const idxAtual = ETAPAS.indexOf(term.status);

  const ckOk = checklistData
    ? CHECKLIST.filter(doc => checklistData[doc.id as keyof TermChecklistOut] === true).length
    : 0;
  const ckTotal = CHECKLIST.length;

  const latestAnalysis = analyses.length > 0 ? analyses[0] : null;
  const score = latestAnalysis?.compliance_score ?? null;
  const scoreColor =
    score == null ? 'text-slate-300'
    : score >= 80 ? 'text-emerald-400'
    : score >= 50 ? 'text-amber-400'
    : 'text-red-400';

  const formatValue = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR');

  // --- Handlers ---
  const handlePdf = async () => {
    try {
      const blob = await exportTermPdf(termId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TR-${termId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar PDF');
    }
  };

  const handleAnalisarIA = async () => {
    setAnalyzingIA(true);
    try {
      await analyzeTerm(termId);
      const updated = await getAnalysesByTerm(termId);
      setAnalyses(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao solicitar análise');
    } finally {
      setAnalyzingIA(false);
    }
  };

  const handleAvancar = async () => {
    setWorkflowLoading(true);
    try {
      await avancarTermo(termId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao avançar processo');
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleDevolver = async () => {
    const obs = window.prompt('Observação (obrigatória):');
    if (!obs || obs.trim().length < 3) {
      if (obs !== null) alert('A observação deve ter pelo menos 3 caracteres.');
      return;
    }
    setWorkflowLoading(true);
    try {
      await devolverTermo(termId, obs.trim());
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao devolver processo');
    } finally {
      setWorkflowLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button
        onClick={() => navegar('lista')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-[#0a2f64] mb-5 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={15} /> Voltar para Processos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* PAINEL PRINCIPAL */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-xl font-black text-[#0a2f64]">{term.title}</h1>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(term.category)}`}>
                    {term.category}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(term.status)}`}>
                    {term.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handlePdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-sm hover:opacity-90"
                  style={{ backgroundColor: COLORS.primary }}
                  title="Baixar PDF"
                >
                  <Download size={13} /> PDF
                </button>
                <button
                  disabled
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed"
                  title="DOCX em breve"
                >
                  <Download size={13} /> DOCX
                </button>
              </div>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg text-xs mb-5 border border-slate-100">
              {[
                { l: 'Status', v: term.status },
                { l: 'Categoria', v: term.category },
                { l: 'Valor Estimado', v: formatValue(term.estimated_value) },
                { l: 'Criado em', v: formatDate(term.created_at) },
              ].map(item => (
                <div key={item.l}>
                  <p className="text-slate-400 font-bold uppercase mb-0.5">{item.l}</p>
                  <p className="font-semibold text-slate-800">{item.v}</p>
                </div>
              ))}
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck size={14} /> Checklist Documental — Art. 54 / Lei 14.133/2021
                </h3>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    ckOk === ckTotal
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {ckOk}/{ckTotal} docs
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {CHECKLIST.map(doc => {
                  const checked = checklistData
                    ? (checklistData[doc.id as keyof TermChecklistOut] === true)
                    : false;
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${
                        checked
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      {checked
                        ? <CheckCircle size={13} className="shrink-0 text-emerald-600" />
                        : <X size={13} className="shrink-0 text-red-500" />}
                      {doc.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Historico */}
          {historico.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider mb-3">
                Histórico de Tramitação
              </h3>
              <div className="space-y-2">
                {historico.map(event => (
                  <div key={event.id} className="flex gap-3 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0a2f64] mt-1.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-700">
                        {event.acao}
                        {event.ator_nome && (
                          <span className="text-slate-400 font-normal"> — {event.ator_nome}</span>
                        )}
                      </p>
                      {event.de_setor && event.para_setor && (
                        <p className="text-slate-400">
                          {event.de_setor} → {event.para_setor}
                        </p>
                      )}
                      {event.observacao && (
                        <p className="text-slate-500 italic mt-0.5">"{event.observacao}"</p>
                      )}
                      <p className="text-slate-300 mt-0.5">{formatDate(event.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PAINEL LATERAL */}
        <div className="space-y-5">
          {/* Score IA */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div
              className="p-3 text-white flex items-center justify-between"
              style={{ backgroundColor: COLORS.primary }}
            >
              <span className="font-bold text-sm flex items-center gap-1.5">
                <Bot size={15} /> Análise IA
              </span>
              <span className={`text-xl font-black ${scoreColor}`}>
                {score != null ? `${score}%` : '--'}
              </span>
            </div>
            <div className="p-4 text-xs">
              {latestAnalysis ? (
                <div className="mb-3 space-y-1.5">
                  <p className="text-slate-500 font-semibold uppercase tracking-wide mb-1">
                    {latestAnalysis.status}
                  </p>
                  {latestAnalysis.suggestions.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-amber-50 rounded border border-amber-100">
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-amber-800">{s.descricao}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-slate-400 mb-3">Documento ainda não analisado pela IA.</p>
                </div>
              )}
              <button
                onClick={handleAnalisarIA}
                disabled={analyzingIA}
                className="w-full py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-white disabled:opacity-60"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Bot size={13} />
                {analyzingIA ? 'Analisando...' : 'Solicitar Análise IA'}
              </button>
            </div>
          </div>

          {/* Fluxo COLIC */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
              Fluxo COLIC/FSPH
            </h3>
            <div className="space-y-1.5 mb-5">
              {ETAPAS.map((step, idx) => {
                const isCur = term.status === step;
                const isPast = idxAtual > idx;
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-2 text-xs font-medium ${
                      isCur ? 'opacity-100' : isPast ? 'opacity-65' : 'opacity-30'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                        ${isCur
                          ? 'bg-[#0a2f64] text-white ring-2 ring-blue-200 ring-offset-1 scale-110'
                          : isPast
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-500'}`}
                    >
                      {isPast ? '✓' : idx + 1}
                    </div>
                    <span className={isCur ? 'text-[#0a2f64] font-bold' : 'text-slate-500'}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>

            {podeAgir ? (
              <div className="space-y-2">
                <button
                  onClick={handleAvancar}
                  disabled={workflowLoading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow transition flex justify-center items-center gap-2 disabled:opacity-60"
                >
                  <CheckCircle size={15} />
                  {workflowLoading ? 'Processando...' : (conf?.acao ?? 'Avançar')}
                </button>
                <button
                  onClick={handleDevolver}
                  disabled={workflowLoading}
                  className="w-full py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg font-bold text-xs transition disabled:opacity-60"
                >
                  ↩ Devolver para Ajustes
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg text-center text-xs border border-slate-200">
                {conf?.ator ? (
                  <>
                    Aguardando ação de:
                    <br />
                    <strong className="text-[#0a2f64] text-sm block mt-0.5">
                      {SETORES.find(s => s.id === conf.ator)?.nome}
                    </strong>
                  </>
                ) : (
                  <span className="text-emerald-700 font-bold">✓ Processo Homologado</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
