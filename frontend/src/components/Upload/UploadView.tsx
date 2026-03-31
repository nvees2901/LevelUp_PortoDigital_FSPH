import { useState, useRef } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  Loader2, XCircle,
} from 'lucide-react';
import { uploadDocument } from '../../services/api';
import type { TelaId, AnalysisResponse, CriterionResult } from '../../types';

interface UploadViewProps {
  navegar: (tela: TelaId) => void;
}

function statusIcon(status: string) {
  if (status === 'aprovado') return <CheckCircle size={18} className="text-emerald-500 shrink-0" />;
  if (status === 'alerta') return <AlertTriangle size={18} className="text-amber-500 shrink-0" />;
  return <XCircle size={18} className="text-red-500 shrink-0" />;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
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
    <div className="max-w-3xl mx-auto mt-10">
      <div className="bg-white p-10 rounded-xl shadow-sm border border-slate-200 text-center">
        {!analisando && !analysis && !error ? (
          <>
            <div className="w-24 h-24 bg-blue-50 text-[#0a2f64] rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
              <Upload size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#0a2f64] mb-3">Validação de Documento</h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto font-medium">
              Faça o upload do seu Termo de Referência (.doc, .docx ou .pdf). O motor de NLP extrairá o texto e validará contra os 10 critérios da Lei 14.133/2021.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div
              className="border-2 border-dashed border-[#0a2f64]/30 bg-slate-50 rounded-xl p-12 cursor-pointer hover:bg-blue-50 hover:border-[#0a2f64] transition-all group"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <FileText size={48} className="mx-auto text-slate-300 group-hover:text-[#0a2f64] mb-4 transition-colors" />
              <p className="text-[#0a2f64] font-bold text-lg">Clique aqui ou arraste o arquivo</p>
              <p className="text-sm text-slate-500 mt-2 font-medium">Suporta DOC, DOCX e PDF (Máx. 10MB)</p>
            </div>
          </>
        ) : analisando ? (
          <div className="py-24">
            <Loader2 size={64} className="animate-spin text-[#0a2f64] mx-auto mb-8" />
            <h3 className="text-2xl font-bold text-[#0a2f64]">Processando via NLP e IA...</h3>
            <p className="text-slate-500 mt-3 font-medium text-lg">
              Extraindo seções de <strong>{fileName}</strong> e validando contra a Lei 14.133/2021.
            </p>
          </div>
        ) : error ? (
          <div className="py-10">
            <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
              <XCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">Erro no Processamento</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <button
              onClick={() => { setError(null); setAnalysis(null); }}
              className="px-6 py-3 bg-[#0a2f64] text-white font-bold rounded-lg hover:bg-[#134084] shadow-md transition"
            >
              Tentar Novamente
            </button>
          </div>
        ) : analysis ? (
          <div className="py-10">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm ${
              Number(analysis.compliance_score) >= 80 ? 'bg-emerald-100 text-emerald-600' :
              Number(analysis.compliance_score) >= 50 ? 'bg-amber-100 text-amber-600' :
              'bg-red-100 text-red-600'
            }`}>
              {Number(analysis.compliance_score) >= 80 ? <CheckCircle size={48} /> :
               Number(analysis.compliance_score) >= 50 ? <AlertTriangle size={48} /> :
               <XCircle size={48} />}
            </div>
            <h2 className="text-3xl font-bold text-[#0a2f64] mb-2">Análise Concluída!</h2>
            <p className="text-slate-500 mb-4">{fileName}</p>

            <div className="bg-white p-8 rounded-xl text-left mt-8 mb-8 border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <span className="font-bold text-slate-700 text-lg">Score de Conformidade:</span>
                <div className="text-right">
                  <span className={`text-3xl font-bold ${scoreColor(Number(analysis.compliance_score))}`}>
                    {Number(analysis.compliance_score).toFixed(1)}%
                  </span>
                  <p className="text-xs text-slate-400 capitalize">{analysis.status}</p>
                </div>
              </div>

              {/* Critérios detalhados */}
              <ul className="space-y-3 text-base font-medium">
                {analysis.criteria_results.map((c: CriterionResult) => (
                  <li key={c.criterio} className={`flex gap-3 items-start p-2 rounded ${
                    c.status === 'reprovado' ? 'bg-red-50' :
                    c.status === 'alerta' ? 'bg-amber-50' : ''
                  }`}>
                    {statusIcon(c.status)}
                    <div>
                      <span className="text-slate-700">{c.artigo}: {c.descricao}</span>
                      <span className="ml-1 text-xs text-slate-400">({c.score}/10)</span>
                      {c.sugestao && (
                        <p className="text-sm text-slate-500 mt-1">{c.sugestao}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Referências legais */}
              {analysis.legal_references.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Referências Legais</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.legal_references.map((ref, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-50 text-[#0a2f64] text-xs rounded font-medium">
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navegar('lista')}
                className="px-8 py-3 bg-[#0a2f64] text-white font-bold rounded-lg hover:bg-[#134084] shadow-md transition text-lg"
              >
                Ver na Base de Termos
              </button>
              <button
                onClick={() => { setAnalysis(null); setError(null); }}
                className="px-6 py-3 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition"
              >
                Novo Upload
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
