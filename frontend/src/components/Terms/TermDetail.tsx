import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle, X, Download, Bot, AlertTriangle, FileCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CHECKLIST, modalColor } from '../../constants';
import { formatCurrency, formatDate, scoreColor } from '../../utils';
import {
  getTerm,
  getAnalysesByTerm,
  getChecklist,
  analyzeTerm,
  exportTermPdf,
} from '../../services/api';
import type {
  TermResponse,
  AnalysisResponse,
  TermChecklistOut,
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingIA, setAnalyzingIA] = useState(false);

  const loadData = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const [termData, analysesData, checklistRaw] = await Promise.all([
        getTerm(termId),
        getAnalysesByTerm(termId),
        getChecklist(termId),
      ]);
      setTerm(termData);
      setAnalyses(analysesData);
      setChecklistData(checklistRaw);
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
          className="flex items-center gap-1.5 text-slate-500 hover:text-brand-primary mb-5 text-sm font-medium transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para Processos
        </button>
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <AlertTriangle size={36} className="mx-auto text-red-400 mb-3" />
          <p className="text-slate-700 font-semibold mb-1">Falha ao carregar o processo</p>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!term) return null;

  // --- Derived values ---
  const ckOk = checklistData
    ? CHECKLIST.filter(doc => checklistData[doc.id as keyof TermChecklistOut] === true).length
    : 0;
  const ckTotal = CHECKLIST.length;

  const latestAnalysis = analyses.length > 0 ? analyses[0] : null;
  const score = latestAnalysis?.compliance_score ?? null;
  const scoreColorClass = score == null ? 'text-slate-300' : scoreColor(score);

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

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button
        onClick={() => navegar('lista')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-brand-primary mb-5 text-sm font-medium transition-colors"
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
                  <h1 className="text-xl font-black text-brand-primary">{term.title}</h1>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(term.category)}`}>
                    {term.category}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handlePdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-primary rounded-lg transition shadow-sm hover:opacity-90"
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-xs mb-5 border border-slate-100">
              {[
                { l: 'Categoria', v: term.category },
                { l: 'Valor Estimado', v: formatCurrency(term.estimated_value) },
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
                <h3 className="font-bold text-brand-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
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
        </div>

        {/* PAINEL LATERAL */}
        <div className="space-y-5">
          {/* Score IA */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 text-white flex items-center justify-between bg-brand-primary">
              <span className="font-bold text-sm flex items-center gap-1.5">
                <Bot size={15} /> Análise IA
              </span>
              <span className={`text-xl font-black ${scoreColorClass}`}>
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
                className="w-full py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-white bg-brand-primary disabled:opacity-60"
              >
                <Bot size={13} />
                {analyzingIA ? 'Analisando...' : 'Solicitar Análise IA'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
