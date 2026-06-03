import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle, X, Download, Bot, AlertTriangle, FileCheck,
  ShieldCheck, ShieldAlert, ShieldX, FileText, MessageSquare,
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
  exportTermDocx,
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

// Mapeia o veredito da análise em uma sinalização de conformidade clara.
function conformidade(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (s.includes('aprov')) return { label: 'Em conformidade', cls: 'badge-green', Icon: ShieldCheck, ring: 'text-emerald-600' };
  if (s.includes('reprov')) return { label: 'Não conforme', cls: 'badge-red', Icon: ShieldX, ring: 'text-red-600' };
  if (s) return { label: 'Atenção', cls: 'badge-amber', Icon: ShieldAlert, ring: 'text-amber-600' };
  return { label: 'Não analisado', cls: 'badge-slate', Icon: ShieldAlert, ring: 'text-slate-400' };
}

export default function TermDetail({ termId, navegar }: TermDetailProps) {
  const { usuario } = useAuth();

  const [term, setTerm] = useState<TermResponse | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResponse[]>([]);
  const [checklistData, setChecklistData] = useState<TermChecklistOut | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingIA, setAnalyzingIA] = useState(false);
  const [baixando, setBaixando] = useState<'pdf' | 'docx' | null>(null);

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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <div className="skeleton h-5 w-40 mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5"><div className="skeleton h-72" /></div>
          <div className="space-y-5"><div className="skeleton h-56" /></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <button onClick={() => navegar('lista')} className="btn btn-ghost btn-sm mb-5">
          <ArrowLeft size={15} /> Voltar para Processos
        </button>
        <div className="card empty-state">
          <AlertTriangle size={36} className="text-red-400 mb-3" />
          <p className="text-slate-700 font-semibold mb-1">Falha ao carregar o processo</p>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button onClick={loadData} className="btn btn-primary btn-sm">Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (!term) return null;

  // --- Derived ---
  const ckOk = checklistData
    ? CHECKLIST.filter(doc => checklistData[doc.id as keyof TermChecklistOut] === true).length
    : 0;
  const ckTotal = CHECKLIST.length;

  const latestAnalysis = analyses.length > 0 ? analyses[0] : null;
  const score = latestAnalysis?.compliance_score ?? null;
  const scoreColorClass = score == null ? 'text-slate-300' : scoreColor(score);
  const conf = conformidade(latestAnalysis?.status);

  // --- Handlers ---
  const baixar = async (kind: 'pdf' | 'docx') => {
    setBaixando(kind);
    try {
      const blob = await (kind === 'pdf' ? exportTermPdf(termId) : exportTermDocx(termId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (term.title || 'documento').slice(0, 40).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
      a.href = url;
      a.download = `TR_${safe || termId}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : `Erro ao baixar ${kind.toUpperCase()}`);
    } finally {
      setBaixando(null);
    }
  };

  const handleAnalisarIA = async () => {
    setAnalyzingIA(true);
    try {
      await analyzeTerm(termId);
      setAnalyses(await getAnalysesByTerm(termId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao solicitar análise');
    } finally {
      setAnalyzingIA(false);
    }
  };

  const ConfIcon = conf.Icon;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button onClick={() => navegar('lista')} className="btn btn-ghost btn-sm mb-4">
        <ArrowLeft size={15} /> Voltar para Processos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* PAINEL PRINCIPAL */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-5">
              <div className="min-w-0">
                <p className="section-title mb-1">Termo de Referência</p>
                <h1 className="text-xl font-black text-brand-primary leading-tight">{term.title}</h1>
                <span className={`badge mt-2 ${modalColor(term.category)}`}>{term.category}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => baixar('pdf')} disabled={baixando !== null} className="btn btn-primary btn-sm" title="Baixar PDF">
                  <Download size={14} /> {baixando === 'pdf' ? '...' : 'PDF'}
                </button>
                <button onClick={() => baixar('docx')} disabled={baixando !== null} className="btn btn-secondary btn-sm" title="Baixar DOCX (Word)">
                  <FileText size={14} /> {baixando === 'docx' ? '...' : 'DOCX'}
                </button>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-lg text-xs mb-6 border border-slate-100">
              {[
                { l: 'Categoria', v: term.category },
                { l: 'Valor Estimado', v: formatCurrency(term.estimated_value) },
                { l: 'Criado em', v: formatDate(term.created_at) },
              ].map(item => (
                <div key={item.l}>
                  <p className="text-slate-400 font-bold uppercase mb-0.5 tracking-wide">{item.l}</p>
                  <p className="font-semibold text-slate-800">{item.v}</p>
                </div>
              ))}
            </div>

            {/* Checklist documental */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title flex items-center gap-1.5">
                  <FileCheck size={14} /> Conformidade documental — Art. 54 / Lei 14.133
                </h3>
                <span className={`badge ${ckOk === ckTotal ? 'badge-green' : 'badge-amber'}`}>
                  {ckOk}/{ckTotal} docs
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {CHECKLIST.map(doc => {
                  const checked = checklistData ? (checklistData[doc.id as keyof TermChecklistOut] === true) : false;
                  return (
                    <div key={doc.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
                        checked ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'
                      }`}>
                      {checked ? <CheckCircle size={14} className="shrink-0 text-emerald-600" /> : <X size={14} className="shrink-0 text-red-500" />}
                      {doc.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL LATERAL — Conformidade (IA) */}
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="p-4 text-white bg-brand-primary">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm flex items-center gap-1.5"><Bot size={15} /> Conformidade (IA)</span>
                <span className={`text-2xl font-black ${scoreColorClass}`}>{score != null ? `${score}%` : '--'}</span>
              </div>
              <p className="text-[11px] text-brand-100 mt-1">Avaliação x Lei 14.133/2021 + base de TRs da FSPH</p>
            </div>
            <div className="p-4">
              {/* Sinalização */}
              <div className="flex items-center gap-2 mb-3">
                <ConfIcon size={18} className={conf.ring} />
                <span className={`badge ${conf.cls}`}>{conf.label}</span>
              </div>

              {latestAnalysis ? (
                <div className="space-y-1.5 mb-4">
                  {latestAnalysis.suggestions.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-amber-50 rounded-lg border border-amber-100 text-xs">
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-amber-800">{s.descricao}</span>
                    </div>
                  ))}
                  {latestAnalysis.suggestions.length === 0 && (
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle size={13} /> Nenhum ajuste apontado pela IA.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 mb-4">Documento ainda não analisado pela IA.</p>
              )}

              <button onClick={handleAnalisarIA} disabled={analyzingIA} className="btn btn-primary btn-sm w-full">
                <Bot size={14} /> {analyzingIA ? 'Analisando...' : 'Solicitar Análise IA'}
              </button>

              {/* Quando há pontos a corrigir, leva ao Chat IA para ajustar */}
              {latestAnalysis && conf.label !== 'Em conformidade' && (
                <button onClick={() => navegar('chat', termId)} className="btn btn-secondary btn-sm w-full mt-2">
                  <MessageSquare size={14} /> Ajustar no Chat IA
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
