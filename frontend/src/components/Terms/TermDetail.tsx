import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle, Download, Bot, AlertTriangle,
  ShieldCheck, ShieldAlert, ShieldX, FileText, MessageSquare, Pencil,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { modalColor } from '../../constants';
import { formatCurrency, formatDate, scoreColor } from '../../utils';
import {
  getTerm,
  getAnalysesByTerm,
  analyzeTerm,
  exportTermPdf,
  exportTermDocx,
  updateTerm,
} from '../../services/api';
import type {
  TermResponse,
  AnalysisResponse,
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingIA, setAnalyzingIA] = useState(false);
  const [baixando, setBaixando] = useState<'pdf' | 'docx' | null>(null);
  const [signModal, setSignModal] = useState<'pdf' | 'docx' | null>(null);
  const [autNome, setAutNome] = useState('');
  const [autCargo, setAutCargo] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('outro');
  const [editValor, setEditValor] = useState('');
  const [editStatus, setEditStatus] = useState('Rascunho');
  const [editContent, setEditContent] = useState('');
  const [salvando, setSalvando] = useState(false);

  const loadData = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const [termData, analysesData] = await Promise.all([
        getTerm(termId),
        getAnalysesByTerm(termId),
      ]);
      setTerm(termData);
      setAnalyses(analysesData);
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
  const latestAnalysis = analyses.length > 0 ? analyses[0] : null;
  const score = latestAnalysis?.compliance_score ?? null;
  const scoreColorClass = score == null ? 'text-slate-300' : scoreColor(score);
  const conf = conformidade(latestAnalysis?.status);

  // --- Handlers ---
  const baixar = async (kind: 'pdf' | 'docx') => {
    setBaixando(kind);
    setSignModal(null);
    try {
      const opts = { autoridade: autNome, autoridadeCargo: autCargo };
      const blob = await (kind === 'pdf' ? exportTermPdf(termId, opts) : exportTermDocx(termId, opts));
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

  const abrirEdicao = () => {
    setEditTitle(term?.title ?? '');
    setEditCategory(term?.category ?? 'outro');
    setEditValor(term?.estimated_value != null ? String(term.estimated_value) : '');
    setEditStatus(term?.status ?? 'Rascunho');
    setEditContent(term?.content ?? '');
    setEditOpen(true);
  };

  const salvarEdicao = async () => {
    setSalvando(true);
    try {
      await updateTerm(termId, {
        title: editTitle.trim() || undefined,
        category: editCategory,
        status: editStatus,
        estimated_value: editValor.trim() === '' ? undefined : Number(editValor),
        content: editContent,
      });
      await loadData();
      setEditOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar alterações');
    } finally {
      setSalvando(false);
    }
  };

  const CATEGORIAS: { v: string; l: string }[] = [
    { v: 'capacitacao', l: 'Capacitação' },
    { v: 'aquisicao', l: 'Aquisição' },
    { v: 'servico_tecnico', l: 'Serviço Técnico' },
    { v: 'outro', l: 'Outro' },
  ];
  const STATUS_OPCOES = [
    'Rascunho', 'Aguardando DIROP', 'Aguardando DIRAF', 'Aguardando DIGER',
    'Instrução COLIC', 'Aguardando Jurídico', 'Aprovação DIRAF/DIGER', 'Homologado',
  ];

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
                <button onClick={abrirEdicao} className="btn btn-ghost btn-sm" title="Editar dados do processo">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => setSignModal('pdf')} disabled={baixando !== null} className="btn btn-primary btn-sm" title="Gerar PDF">
                  <Download size={14} /> {baixando === 'pdf' ? '...' : 'PDF'}
                </button>
                <button onClick={() => setSignModal('docx')} disabled={baixando !== null} className="btn btn-secondary btn-sm" title="Gerar DOCX (Word)">
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

      {/* Modal: Autoridade competente antes de gerar o documento */}
      {signModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/40 p-4 animate-fade-in"
          onClick={() => setSignModal(null)}
        >
          <div className="card shadow-card-lg w-full max-w-md p-5 animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-1">Gerar {signModal.toUpperCase()}</h3>
            <p className="text-sm text-slate-500 mb-4">
              Informe a autoridade competente que assinará o documento (opcional — deixe em branco para manter o campo de assinatura vazio).
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Autoridade competente — Nome</label>
                <input
                  className="input"
                  value={autNome}
                  onChange={e => setAutNome(e.target.value)}
                  placeholder="Ex.: Roberto Dias Nogueira"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Cargo / Função</label>
                <input
                  className="input"
                  value={autCargo}
                  onChange={e => setAutCargo(e.target.value)}
                  placeholder="Ex.: Diretor-Geral da FSPH"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setSignModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={() => baixar(signModal)}>
                <Download size={14} /> Gerar {signModal.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar dados do processo */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/40 p-4 animate-fade-in"
          onClick={() => setEditOpen(false)}
        >
          <div className="card shadow-card-lg w-full max-w-2xl p-5 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-4">Editar processo</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Objeto / Título</label>
                <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                  {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Valor estimado (R$)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editValor}
                  onChange={e => setEditValor(e.target.value)}
                  placeholder="Ex.: 480000.00"
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                  {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Conteúdo do TR (texto do documento)</label>
                <textarea
                  className="input min-h-[180px] font-mono text-xs leading-relaxed"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="Texto do Termo de Referência (markdown)"
                />
                <p className="text-xs text-slate-400 mt-1">É este texto que aparece no PDF/DOCX gerado.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={salvarEdicao} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
