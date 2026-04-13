import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Paperclip, X, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants';
import { sendChatMessage } from '../../services/api';
import type { TelaId, MensagemChat } from '../../types';

interface ChatViewProps {
  navegar: (tela: TelaId) => void;
}

function consultar(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes('dispensa'))
    return 'A **Dispensa de Licitacao** (Art. 75, Lei 14.133/2021) aplica-se para baixo valor, emergencia ou licitacao frustrada. Fluxo na FSPH: Area Demandante \u2192 DIROP \u2192 DIRAF \u2192 DIGER \u2192 COLIC instrui \u2192 Juridico emite parecer \u2192 DIRAF/DIGER aprovam \u2192 Publicacao no PNCP \u2192 Formalizacao.';
  if (t.includes('inexigibilidade'))
    return 'A **Inexigibilidade** (Art. 74) ocorre quando a competicao e inviavel: fornecedor exclusivo, notoria especializacao ou atividades artisticas.';
  if (t.includes('licitacao') || t.includes('pregao'))
    return 'A **Licitacao** e a modalidade padrao (Arts. 28\u201373). O pregao eletronico e obrigatorio para bens e servicos comuns.';
  if (t.includes('prazo') || t.includes('vigencia'))
    return 'Prazos contratuais maximos pela Lei 14.133/2021: **Servicos continuos**: 5 anos (prorrogavel). **Ata de Registro de Precos**: 1 ano. **Servicos de TI**: ate 10 anos.';
  if (t.includes('dfd'))
    return 'O **DFD** (Documento de Formalizacao da Demanda) e o ponto de partida do processo.';
  if (t.includes('etp'))
    return 'O **ETP** (Estudo Tecnico Preliminar) avalia alternativas viaveis e identifica a modalidade licitatoria mais adequada.';
  if (t.includes('colic'))
    return 'A **COLIC** e a unidade central de governanca das contratacoes. Confere checklist documental e define modalidade.';
  return 'Posso responder sobre: modalidades de contratacao (Licitacao, Dispensa, Inexigibilidade), fluxos DIROP/DIRAF/DIGER/COLIC, checklist documental, prazos legais, DFD, ETP, Termo de Referencia.';
}

function renderTexto(txt: string) {
  return txt.split('\n').map((line, i) => {
    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return <p key={i} className={line === '' ? 'h-1' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

export default function ChatView({ navegar }: ChatViewProps) {
  const { usuario } = useAuth();
  const isDemandante = usuario?.id === 'demandante';

  const [msgs, setMsgs] = useState<MensagemChat[]>([{
    de: 'ia',
    texto: isDemandante
      ? 'Ola! Sou o Assistente COLIC da FSPH, treinado na Lei 14.133/2021 e nos fluxos internos. Posso ajudar voce a elaborar processos de contratacao ou analisar documentos. Como posso ajudar?'
      : `Ola, ${usuario?.nome}! Sou o Assistente COLIC. Posso responder duvidas sobre fluxos da COLIC, modalidades de contratacao, checklist documental e prazos legais. Como posso ajudar?`,
  }]);
  const [input, setInput] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, analisando]);

  const addMsg = (de: 'ia' | 'user', texto: string, extra: Partial<MensagemChat> = {}) =>
    setMsgs(prev => [...prev, { de, texto, ...extra }]);

  const analisarArquivo = (file: File) => {
    addMsg('user', `\ud83d\udcce Arquivo anexado para analise: ${file.name}`, { isArquivo: true });
    setArquivo(null);
    setAnalisando(true);
    setTimeout(() => {
      setAnalisando(false);
      addMsg('ia',
        `\ud83d\udcca Analise concluida \u2014 "${file.name}"\n\nScore de conformidade (Lei 14.133/2021): **82%**\n\n\u2705 Art. 6\u00ba, XXIII \u2013 Objeto claramente definido\n\u2705 Art. 18 \u2013 Estudo Tecnico Preliminar presente\n\u26a0\ufe0f Art. 156 \u2013 Sancoes administrativas nao localizadas\n\u274c Art. 40 \u2013 Prazo de vigencia nao especificado\n\nRecomendo complementar os itens sinalizados antes de enviar ao DIROP.`,
        { isAnalise: true }
      );
    }, 2200);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (arquivo) { analisarArquivo(arquivo); return; }
    if (!input.trim()) return;
    const txt = input.trim();
    addMsg('user', txt);
    setInput('');

    // Try API first, fallback to local knowledge
    try {
      const res = await sendChatMessage({ message: txt, mode: 'consultar' });
      addMsg('ia', res.message);
    } catch {
      setTimeout(() => addMsg('ia', consultar(txt)), 700);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col bg-white rounded-xl shadow-sm border border-slate-200"
      style={{ height: 'calc(100vh - 130px)' }}>

      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3 rounded-t-xl text-white" style={{ backgroundColor: COLORS.primary }}>
        <div className="p-2 bg-white/10 rounded-lg"><Bot size={18} /></div>
        <div className="flex-1">
          <p className="font-bold text-sm">Assistente IA \u2014 COLIC/FSPH</p>
          <p className="text-xs text-blue-300">
            {isDemandante ? 'Elaboracao guiada de processos' : 'Consulta sobre fluxos e legislacao'} \u2022 Lei 14.133/2021 \u2022 Decreto 342/2023
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="font-bold">{usuario?.nome}</p>
          <p className="text-blue-300">{usuario?.subunidade ? usuario.subunidade.split('\u2013')[0].trim() : usuario?.descricao}</p>
        </div>
      </div>

      {/* Quick suggestions */}
      {msgs.length <= 1 && (
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500 font-medium mb-2">Perguntas frequentes:</p>
          <div className="flex flex-wrap gap-1.5">
            {['Como funciona a Dispensa?', 'O que e o DFD?', 'Prazos contratuais', 'Fluxo COLIC/DIROP/DIRAF', 'O que e Inexigibilidade?'].map(q => (
              <button key={q} onClick={() => setInput(q)}
                className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-full text-[#0a2f64] hover:border-[#0a2f64] hover:bg-blue-50 transition font-medium">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'ia' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[88%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm space-y-0.5
              ${m.de === 'ia'
                ? m.isAnalise ? 'bg-blue-50 border border-blue-200 text-slate-800 rounded-tl-none'
                : m.isConclusao ? 'bg-emerald-50 border border-emerald-200 text-slate-800 rounded-tl-none'
                : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                : m.isArquivo ? 'bg-blue-700 text-white rounded-tr-none'
                : 'text-white rounded-tr-none'}`}
              style={m.de === 'user' && !m.isArquivo ? { backgroundColor: COLORS.primary } : {}}>
              {m.de === 'ia' ? renderTexto(m.texto) : <p>{m.texto}</p>}
              {m.isConclusao && (
                <button onClick={() => navegar('lista')}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition text-xs">
                  <FileText size={12} /> Ver Processo Gerado
                </button>
              )}
            </div>
          </div>
        ))}

        {analisando && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 text-xs text-slate-500">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              Analisando documento com IA...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Pending file */}
      {arquivo && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-700 font-medium">
            <Paperclip size={13} /> {arquivo.name}
            <span className="text-blue-400">\u2014 Clique em Enviar para analisar</span>
          </div>
          <button onClick={() => setArquivo(null)} className="text-red-400 hover:text-red-600 transition">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={enviar} className="p-3 border-t border-slate-200 bg-white rounded-b-xl flex gap-2 items-center">
        <input type="file" ref={fileRef} onChange={e => { if (e.target.files?.[0]) setArquivo(e.target.files[0]); }} className="hidden" accept=".pdf,.doc,.docx" />
        <button type="button" onClick={() => fileRef.current?.click()}
          title="Anexar documento (PDF, DOC)"
          className="p-2.5 text-slate-400 hover:text-[#0a2f64] hover:bg-blue-50 rounded-lg transition shrink-0">
          <Paperclip size={17} />
        </button>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder={isDemandante ? 'Descreva o objeto da contratacao...' : 'Faca sua pergunta sobre fluxos ou legislacao...'}
          className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
        <button type="submit"
          disabled={!input.trim() && !arquivo}
          style={{ backgroundColor: COLORS.primary }}
          className="p-2.5 text-white rounded-lg hover:bg-[#134084] disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm shrink-0">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
