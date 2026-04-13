import { useState, useEffect } from 'react';
import {
  ArrowLeft, FileText, Download, Bot,
  CheckCircle, AlertTriangle, Loader2, XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FLUXO, SETORES } from '../../constants';
import { getTerm, getAnalysesByTerm, getAnalysis, exportTermPdf, analyzeTerm } from '../../services/api';
import type { TermoMock, TelaId, TermResponse, AnalysisResponse, CriterionResult } from '../../types';

interface TermDetailProps {
  termo: TermoMock | null;
  avancarFluxo: (termoId: string) => void;
  navegar: (tela: TelaId, termo?: TermoMock) => void;
}

function statusIcon(status: string) {
  if (status === 'aprovado') return <CheckCircle size={16} className="text-emerald-500 shrink-0" />;
  if (status === 'alerta') return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
  return <XCircle size={16} className="text-red-500 shrink-0" />;
}

export default function TermDetail({ termo, avancarFluxo, navegar }: TermDetailProps) {
  const { usuario } = useAuth();
  const [termData, setTermData] = useState<TermResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    if (!termo) return;
    const termoId = termo.id;
    let cancelled = false;

    async function fetchData() {
      try {
        // Tenta buscar o TR e análises da API
        const [termResp, analyses] = await Promise.all([
          getTerm(termoId).catch(() => null),
          getAnalysesByTerm(termoId).catch(() => []),
        ]);

        if (cancelled) return;

        if (termResp) {
          setTermData(termResp);
          setApiConnected(true);
        }

        // Pega a análise mais recente
        if (Array.isArray(analyses) && analyses.length > 0) {
          const latest = analyses[0];
          if (latest?.id) {
            const full = await getAnalysis(latest.id).catch(() => null);
            if (!cancelled && full) setAnalysis(full);
          }
        }
      } catch {
        if (!cancelled) setApiConnected(false);
      } finally {
        if (!cancelled) setLoadingAnalysis(false);
      }
    }

    setLoadingAnalysis(true);
    fetchData();
    return () => { cancelled = true; };
  }, [termo]);

  if (!termo || !usuario) return null;

  const confAtual = FLUXO[termo.status];
  const podeAgir = confAtual && confAtual.ator === usuario.id;

  const handleExportPdf = async () => {
    try {
      const blob = await exportTermPdf(termo.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TR_${termo.id}.pdf`;
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

  // Dados a exibir
  const displayTitle = apiConnected && termData ? termData.title : termo.objeto;
  const displayContent = termData?.content;
  const sections = termData?.sections;
  const score = analysis?.compliance_score ?? termo.scoreIA;
  const criteria = analysis?.criteria_results;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button
        onClick={() => navegar('lista')}
        className="flex items-center gap-2 text-slate-500 hover:text-[#0a2f64] mb-6 transition-colors font-medium"
      >
        <ArrowLeft size={18} /> Voltar para a Base
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel Principal */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold text-[#0a2f64] mb-2">{termo.id.length > 20 ? termo.id.slice(0, 8) + '...' : termo.id}</h1>
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
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Autor</p>
                <p className="font-medium text-slate-800">{termo.autor}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Data Criação</p>
                <p className="font-medium text-slate-800">{termo.data}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Valor Estimado</p>
                <p className="font-bold text-[#0a2f64]">{termo.valor}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Status</p>
                <p className="font-medium text-amber-600">{termo.status}</p>
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
                  <>
                    <div className="text-center mb-6">
                      <p className="font-bold text-lg">FUNDAÇÃO DE SAÚDE PARREIRAS HORTA - FSPH</p>
                      <p className="font-semibold">TERMO DE REFERÊNCIA</p>
                    </div>
                    <p><strong>1. DO OBJETO</strong><br />{termo.objeto}, conforme especificações e quantitativos estabelecidos neste Termo de Referência.</p>
                    <p className="mt-4"><strong>2. FUNDAMENTAÇÃO E DESCRIÇÃO DA NECESSIDADE</strong><br />A contratação faz-se necessária para garantir o pleno funcionamento das unidades administradas pela FSPH, em conformidade com o Art. 72 da Lei 14.133/2021...</p>
                    <p className="mt-8 text-center text-slate-400 italic">[Final do fragmento visível do documento]</p>
                  </>
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
              <span className="text-2xl font-bold text-emerald-400">{score ?? '--'}%</span>
            </div>
            <div className="p-5 bg-white">
              {loadingAnalysis ? (
                <div className="text-center py-4">
                  <Loader2 size={24} className="animate-spin text-[#0a2f64] mx-auto" />
                  <p className="text-slate-500 text-sm mt-2">Carregando análise...</p>
                </div>
              ) : criteria && criteria.length > 0 ? (
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
              ) : score ? (
                <ul className="space-y-4 text-sm font-medium">
                  <li className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">Art. 18 (Fase Preparatória) contemplado.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">Art. 23 (Valor Estimado) fundamentado.</span>
                  </li>
                  <li className="flex items-start gap-3 p-3 bg-amber-50 rounded border border-amber-100">
                    <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-amber-800">Sugestão: Detalhar melhor os critérios de sustentabilidade (Art. 11, IV).</span>
                  </li>
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

              {/* Sugestões priorizadas */}
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

          {/* Workflow */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-[#0a2f64] mb-5 border-b border-slate-100 pb-2 text-lg">Fluxo de Aprovação</h3>

            <div className="space-y-5 mb-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {Object.keys(FLUXO).map((step, idx) => {
                const isCurrent = termo.status === step;
                const isPast = Object.keys(FLUXO).indexOf(termo.status) > idx;
                if (step === 'Rascunho' && termo.status !== 'Rascunho') return null;

                return (
                  <div
                    key={step}
                    className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active ${
                      isCurrent ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-40'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${
                        isCurrent
                          ? 'border-[#0a2f64] bg-white z-10 scale-125'
                          : isPast
                          ? 'border-emerald-500 bg-emerald-500 text-white z-10'
                          : 'border-slate-300 bg-slate-100 z-10'
                      } shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm transition-transform`}
                    >
                      {isPast && <CheckCircle size={14} />}
                    </div>
                    <div
                      className={`w-[calc(100%-2.5rem)] md:w-[calc(50%-2rem)] text-xs font-bold py-2 px-3 rounded-lg ${
                        isCurrent ? 'bg-blue-50 text-[#0a2f64] border border-blue-100' : 'text-slate-600'
                      }`}
                    >
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>

            {podeAgir ? (
              <div className="pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-3 font-medium text-center">Sua ação é necessária.</p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => avancarFluxo(termo.id)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow transition flex justify-center items-center gap-2"
                  >
                    <CheckCircle size={18} /> {confAtual.acao}
                  </button>
                  <button className="w-full py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-bold transition text-sm">
                    Devolver para Ajustes
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 p-4 bg-amber-50 rounded-lg text-center text-sm border border-amber-100">
                Aguardando ação de:<br />
                <strong className="text-amber-800 text-base">
                  {SETORES.find((s) => s.id === confAtual?.ator)?.nome || 'Concluído'}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
