import { useState } from 'react';
import {
  ArrowLeft, CheckCircle, X, Download, Bot, AlertTriangle, FileCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FLUXO, ETAPAS, CHECKLIST, SETORES, COLORS, statusColor, modalColor } from '../../constants';
import type { TermoMock, TelaId } from '../../types';

interface TermDetailProps {
  termo: TermoMock | null;
  navegar: (tela: TelaId, termo?: TermoMock) => void;
}

export default function TermDetail({ termo, navegar }: TermDetailProps) {
  const { usuario } = useAuth();
  const [score] = useState(termo?.scoreIA ?? null);

  if (!termo || !usuario) return null;

  const t = termo;
  const conf = FLUXO[t.status];
  const podeAgir = conf && conf.ator === usuario.id;
  const ck = t.checklist || {};
  const ckTotal = CHECKLIST.length;
  const ckOk = CHECKLIST.filter(d => ck[d.id]).length;
  const idxAtual = ETAPAS.indexOf(t.status);

  const corColor = score != null ? (score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400') : 'text-slate-300';

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button onClick={() => navegar('lista')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-[#0a2f64] mb-5 text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Voltar para Processos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* PAINEL PRINCIPAL */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-xl font-black text-[#0a2f64]">{t.id}</h1>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${modalColor(t.modalidade)}`}>{t.modalidade}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(t.status)}`}>{t.status}</span>
                </div>
                <p className="text-sm text-slate-700 font-medium">{t.objeto}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-sm"
                  style={{ backgroundColor: COLORS.primary }}
                  title="Baixar PDF">
                  <Download size={13} /> PDF
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0a2f64] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                  title="Baixar DOCX">
                  <Download size={13} /> DOCX
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg text-xs mb-5 border border-slate-100">
              {[
                { l: 'Unidade', v: t.unidade?.split('\u2013')[0].trim() },
                { l: 'Autor', v: t.autor },
                { l: 'Valor Estimado', v: t.valor },
                { l: 'Data', v: t.data },
              ].map(i => (
                <div key={i.l}>
                  <p className="text-slate-400 font-bold uppercase mb-0.5">{i.l}</p>
                  <p className="font-semibold text-slate-800">{i.v}</p>
                </div>
              ))}
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck size={14} /> Checklist Documental — Art. 54 / Lei 14.133/2021
                </h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ckOk === ckTotal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {ckOk}/{ckTotal} docs
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {CHECKLIST.map(doc => (
                  <div key={doc.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${ck[doc.id] ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {ck[doc.id]
                      ? <CheckCircle size={13} className="shrink-0 text-emerald-600" />
                      : <X size={13} className="shrink-0 text-red-500" />}
                    {doc.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL LATERAL */}
        <div className="space-y-5">
          {/* Score IA */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 text-white flex items-center justify-between" style={{ backgroundColor: COLORS.primary }}>
              <span className="font-bold text-sm flex items-center gap-1.5"><Bot size={15} /> Analise IA</span>
              <span className={`text-xl font-black ${corColor}`}>
                {score != null && score > 0 ? `${score}%` : '--'}
              </span>
            </div>
            <div className="p-4 text-xs">
              {score != null && score > 0 ? (
                <div className="space-y-2 mb-3">
                  <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span>Art. 18 (Fase Preparatoria) contemplado.</span></div>
                  <div className="flex items-start gap-1.5"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span>Art. 23 (Valor Estimado) fundamentado.</span></div>
                  {score < 100 && (
                    <div className="flex items-start gap-1.5 p-2 bg-amber-50 rounded border border-amber-100">
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-amber-800">Detalhar criterios de sustentabilidade (Art. 11, IV).</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-slate-400 mb-3">Documento ainda nao analisado pela IA.</p>
                </div>
              )}
              <button
                className="w-full py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-white"
                style={{ backgroundColor: COLORS.primary }}>
                <Bot size={13} /> Solicitar Analise IA
              </button>
            </div>
          </div>

          {/* Fluxo de Aprovacao */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-bold text-[#0a2f64] text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
              Fluxo COLIC/FSPH
            </h3>
            <div className="space-y-1.5 mb-5">
              {ETAPAS.map((step, idx) => {
                const isCur = t.status === step;
                const isPast = idxAtual > idx;
                return (
                  <div key={step} className={`flex items-center gap-2 text-xs font-medium ${isCur ? 'opacity-100' : isPast ? 'opacity-65' : 'opacity-30'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                      ${isCur ? 'bg-[#0a2f64] text-white ring-2 ring-blue-200 ring-offset-1 scale-110'
                      : isPast ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500'}`}>
                      {isPast ? '\u2713' : idx + 1}
                    </div>
                    <span className={isCur ? 'text-[#0a2f64] font-bold' : 'text-slate-500'}>{step}</span>
                  </div>
                );
              })}
            </div>

            {podeAgir ? (
              <div className="space-y-2">
                <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow transition flex justify-center items-center gap-2">
                  <CheckCircle size={15} /> {conf.acao}
                </button>
                <button className="w-full py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg font-bold text-xs transition">
                  \u21a9 Devolver para Ajustes
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg text-center text-xs border border-slate-200">
                {conf?.ator
                  ? <>Aguardando acao de:<br /><strong className="text-[#0a2f64] text-sm block mt-0.5">{SETORES.find(s => s.id === conf.ator)?.nome}</strong></>
                  : <span className="text-emerald-700 font-bold">\u2713 Processo Homologado</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
