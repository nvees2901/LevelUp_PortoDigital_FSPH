import { useState, useRef } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  Loader2, XCircle, UploadCloud, ShieldCheck, RotateCcw, ArrowRight, Scale,
} from 'lucide-react';
import { uploadDocument } from '../../services/api';
import type { TelaId, AnalysisResponse, CriterionResult } from '../../types';
import { scoreColor } from '../../utils';

interface UploadViewProps {
  navegar: (tela: TelaId) => void;
}

function statusIcon(status: string) {
  if (status === 'aprovado') return <CheckCircle size={18} className="text-emerald-500 shrink-0" />;
  if (status === 'alerta') return <AlertTriangle size={18} className="text-amber-500 shrink-0" />;
  return <XCircle size={18} className="text-red-500 shrink-0" />;
}

function statusBadge(status: string) {
  if (status === 'aprovado')
    return <span className="badge badge-green"><CheckCircle size={12} /> OK</span>;
  if (status === 'alerta')
    return <span className="badge badge-amber"><AlertTriangle size={12} /> Atenção</span>;
  return <span className="badge badge-red"><XCircle size={12} /> Falha</span>;
}

export default function UploadView({ navegar }: UploadViewProps) {
  const [analisando, setAnalisando] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setAnalisando(true);
    setError(null);
    setFileName(file.name);

    try {
      const result = await uploadDocument(file);
      setAnalysis(result.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar documento');
    } finally {
      setAnalisando(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 animate-fade-in">
      {/* Cabeçalho da seção */}
      <div className="mb-6">
        <p className="section-title flex items-center gap-1.5 mb-2">
          <Scale size={13} /> Lei 14.133/2021
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Validação de Documento</h1>
        <p className="text-slate-500 mt-2 max-w-xl">
          Faça o upload do seu Termo de Referência. O motor de NLP extrai o texto e valida
          automaticamente contra os 10 critérios legais.
        </p>
      </div>

      <div className="card p-6 sm:p-8">
        {!analisando && !analysis && !error ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Área de drag & drop */}
            <button
              type="button"
              aria-label="Clique ou arraste um arquivo para enviar"
              className="group w-full border-2 border-dashed border-slate-300 bg-slate-50/60 rounded-xl px-6 py-14 text-center
                         transition-all duration-200 cursor-pointer
                         hover:bg-brand-50 hover:border-brand-400
                         focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white border border-slate-200 shadow-card
                              flex items-center justify-center text-brand-primary
                              transition-transform duration-200 group-hover:scale-105 group-hover:bg-brand-primary group-hover:text-white">
                <UploadCloud size={30} />
              </div>
              <p className="text-brand-primary font-semibold text-lg">Clique aqui ou arraste o arquivo</p>
              <p className="text-sm text-slate-500 mt-1.5">Suporta DOC, DOCX e PDF · máx. 10MB</p>
            </button>

            {/* Estado vazio / dica abaixo da área */}
            <div className="empty-state pt-8 pb-0">
              <ShieldCheck size={28} className="mb-2 text-slate-300" />
              <p className="text-sm">Nenhum documento analisado ainda.</p>
              <p className="text-xs mt-0.5">O resultado da conformidade aparecerá aqui após o envio.</p>
            </div>
          </>
        ) : analisando ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-50 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-brand-primary" />
            </div>
            <h3 className="text-xl font-bold text-brand-primary">Processando via NLP e IA…</h3>
            <p className="text-slate-500 mt-2">
              Extraindo seções de <strong className="text-slate-700">{fileName}</strong> e validando
              contra a Lei 14.133/2021.
            </p>

            {/* Skeleton dos critérios em carregamento */}
            <div className="mt-8 space-y-3 text-left max-w-xl mx-auto">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                  <div className="skeleton h-9 w-9 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-2/3" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1.5">Erro no Processamento</h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => { setError(null); setAnalysis(null); }}
              className="btn btn-primary btn-md"
            >
              <RotateCcw size={16} /> Tentar Novamente
            </button>
          </div>
        ) : analysis ? (
          <div className="animate-fade-in">
            {/* Cabeçalho do resultado */}
            <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                Number(analysis.compliance_score) >= 80 ? 'bg-emerald-50 text-emerald-600' :
                Number(analysis.compliance_score) >= 50 ? 'bg-amber-50 text-amber-600' :
                'bg-red-50 text-red-600'
              }`}>
                {Number(analysis.compliance_score) >= 80 ? <CheckCircle size={28} /> :
                 Number(analysis.compliance_score) >= 50 ? <AlertTriangle size={28} /> :
                 <XCircle size={28} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-brand-primary">Análise Concluída</h2>
                <p className="text-sm text-slate-500 flex items-center gap-1.5 truncate">
                  <FileText size={14} className="shrink-0" /> {fileName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-3xl font-bold leading-none ${scoreColor(Number(analysis.compliance_score))}`}>
                  {Number(analysis.compliance_score).toFixed(1)}%
                </span>
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-1 capitalize">{analysis.status}</p>
              </div>
            </div>

            {/* Critérios detalhados */}
            <div className="py-6">
              <p className="section-title mb-3">Critérios de Conformidade</p>
              <ul className="space-y-2.5">
                {analysis.criteria_results.map((c: CriterionResult) => (
                  <li
                    key={c.criterio}
                    className={`card card-hover p-4 flex gap-3 items-start ${
                      c.status === 'reprovado' ? 'border-red-200 bg-red-50/40' :
                      c.status === 'alerta' ? 'border-amber-200 bg-amber-50/40' : ''
                    }`}
                  >
                    <div className="mt-0.5">{statusIcon(c.status)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-800 text-sm leading-snug">
                          {c.artigo}
                          <span className="font-normal text-slate-600"> · {c.descricao}</span>
                        </p>
                        {statusBadge(c.status)}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Pontuação: {c.score}/10</p>
                      {c.sugestao && (
                        <p className="text-sm text-slate-600 mt-2 bg-white/70 border border-slate-100 rounded-lg px-3 py-2">
                          {c.sugestao}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Referências legais */}
              {analysis.legal_references.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <p className="section-title mb-2.5">Referências Legais</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.legal_references.map((ref, i) => (
                      <span key={i} className="badge badge-blue">
                        <Scale size={11} /> {ref}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => navegar('lista')}
                className="btn btn-primary btn-lg flex-1"
              >
                Ver em Processos <ArrowRight size={18} />
              </button>
              <button
                onClick={() => { setAnalysis(null); setError(null); }}
                className="btn btn-secondary btn-lg"
              >
                <Upload size={16} /> Novo Upload
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
