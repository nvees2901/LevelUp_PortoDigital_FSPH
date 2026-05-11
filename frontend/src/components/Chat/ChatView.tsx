import { useState, useRef, useEffect } from 'react';
import { Bot, Send, FileText, Paperclip } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants';
import { sendChatMessage, finalizeChatSession, listChatSessions, getChatSession, uploadDocument } from '../../services/api';
import type { TelaId, MensagemChat, ChatMode, ChatSessionSummary } from '../../types';

interface ChatViewProps {
  navegar: (tela: TelaId) => void;
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

  function buildWelcome(): MensagemChat {
    return {
      de: 'ia',
      texto: isDemandante
        ? 'Ola! Sou o Assistente COLIC da FSPH, treinado na Lei 14.133/2021 e nos fluxos internos. Posso ajudar voce a elaborar processos de contratacao ou analisar documentos. Como posso ajudar?'
        : `Ola, ${usuario?.nomeUsuarioLogado}! Sou o Assistente COLIC. Posso responder duvidas sobre fluxos da COLIC, modalidades de contratacao, checklist documental e prazos legais. Como posso ajudar?`,
    };
  }

  const [msgs, setMsgs] = useState<MensagemChat[]>([buildWelcome()]);
  const [input, setInput] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('consultar');
  const [finalizing, setFinalizing] = useState(false);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [attachedTermId, setAttachedTermId] = useState<string | null>(null);
  const [attachedTermTitle, setAttachedTermTitle] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, analisando]);

  const addMsg = (de: 'ia' | 'user', texto: string, extra: Partial<MensagemChat> = {}) =>
    setMsgs(prev => [...prev, { de, texto, ...extra }]);

  const loadSessions = async (m: ChatMode) => {
    setSessionsLoading(true);
    try {
      const res = await listChatSessions(m);
      setSessions(res.items);
    } catch { /* silent */ }
    finally { setSessionsLoading(false); }
  };

  useEffect(() => { loadSessions(mode); }, [mode]);

  const loadSession = async (sid: string) => {
    try {
      const res = await getChatSession(sid);
      setSessionId(res.id);
      setMsgs(res.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ de: m.role === 'user' ? 'user' as const : 'ia' as const, texto: m.content }))
      );
      setAttachedTermId(null);
      setAttachedTermTitle(null);
    } catch (err) {
      addMsg('ia', 'Nao foi possivel carregar a sessao.');
    }
  };

  const novaSessao = () => {
    setSessionId(null);
    setMsgs([buildWelcome()]);
    setAttachedTermId(null);
    setAttachedTermTitle(null);
  };

  const handleModeChange = (newMode: ChatMode) => {
    setMode(newMode);
    setSessionId(null);
    setMsgs([buildWelcome()]);
    setAttachedTermId(null);
    setAttachedTermTitle(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingFile(true);
    addMsg('ia', `Enviando "${file.name}"...`);
    try {
      const { term } = await uploadDocument(file);
      setAttachedTermId(term.id);
      setAttachedTermTitle(term.title);
      addMsg('ia', `TR "${term.title}" carregado. Pode fazer perguntas sobre ele agora.`);
    } catch (err) {
      addMsg('ia', `Erro ao carregar arquivo: ${err instanceof Error ? err.message : 'tente novamente'}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || analisando) return;
    const txt = input.trim();
    addMsg('user', txt);
    setInput('');
    setAnalisando(true);
    try {
      const res = await sendChatMessage({
        message: txt,
        mode,
        session_id: sessionId ?? undefined,
        term_id: attachedTermId ?? undefined,
      });
      setSessionId(res.session_id);
      addMsg('ia', res.message);
      loadSessions(mode);
    } catch (err) {
      addMsg('ia', err instanceof Error ? err.message : 'Nao foi possivel contactar o assistente. Tente novamente.');
    } finally {
      setAnalisando(false);
    }
  };

  const finalizar = async () => {
    if (!sessionId) return;
    setFinalizing(true);
    try {
      await finalizeChatSession(sessionId);
      navegar('lista');
    } catch (err) {
      addMsg('ia', err instanceof Error ? err.message : 'Erro ao finalizar TR. Tente novamente.');
    } finally {
      setFinalizing(false);
    }
  };

  const MODES: { id: ChatMode; label: string }[] = [
    { id: 'consultar', label: 'Consultar' },
    { id: 'analisar', label: 'Analisar TR' },
    { id: 'gerar', label: 'Gerar TR' },
  ];

  return (
    <div className="max-w-4xl mx-auto flex bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
      style={{ height: 'calc(100vh - 130px)' }}>

      {/* Sidebar */}
      <div className="hidden sm:flex flex-col w-60 border-r border-slate-200 bg-slate-50">
        <div className="p-3 border-b border-slate-200">
          <button onClick={novaSessao}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0a2f64] text-white rounded-lg text-xs font-bold hover:bg-[#134084] transition">
            + Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessionsLoading ? (
            <div className="text-xs text-slate-400 text-center py-4">Carregando...</div>
          ) : sessions.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-4">Nenhuma conversa anterior.</div>
          ) : sessions.map(s => (
            <button key={s.id} onClick={() => loadSession(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition hover:bg-slate-100 ${s.id === sessionId ? 'bg-blue-50 border border-blue-200 text-[#0a2f64] font-semibold' : 'text-slate-600'}`}>
              <p className="truncate font-medium">{s.title ?? `Sessao ${s.id.slice(0, 8)}`}</p>
              <p className="text-slate-400 text-[10px]">{s.message_count} msg • {s.updated_at.slice(0, 10)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="p-4 border-b text-white" style={{ backgroundColor: COLORS.primary }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-white/10 rounded-lg"><Bot size={18} /></div>
            <div className="flex-1">
              <p className="font-bold text-sm">Assistente IA — COLIC/FSPH</p>
              <p className="text-xs text-blue-300">
                {isDemandante ? 'Elaboracao guiada de processos' : 'Consulta sobre fluxos e legislacao'} • Lei 14.133/2021 • Decreto 342/2023
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold">{usuario?.nomeUsuarioLogado}</p>
              <p className="text-blue-300">{usuario?.subunidade ? usuario.subunidade.split('–')[0].trim() : usuario?.descricao}</p>
            </div>
          </div>

          {/* Mode selector */}
          <div className="flex gap-1.5">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                disabled={analisando}
                className={`text-xs px-3 py-1 rounded-full font-medium transition border
                  ${mode === m.id
                    ? 'bg-white text-[#0a2f64] border-white'
                    : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
                  }`}
              >
                {m.label}
              </button>
            ))}
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
                  ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  : 'text-white rounded-tr-none'}`}
                style={m.de === 'user' ? { backgroundColor: COLORS.primary } : {}}>
                {m.de === 'ia' ? renderTexto(m.texto) : <p>{m.texto}</p>}
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
                Aguardando resposta...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-2">

          {/* Attachment chip */}
          {attachedTermId && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
              <FileText size={13} className="text-blue-600 shrink-0" />
              <span className="text-blue-800 font-medium truncate">{attachedTermTitle ?? attachedTermId}</span>
              <button onClick={() => { setAttachedTermId(null); setAttachedTermTitle(null); }}
                className="ml-auto text-blue-400 hover:text-blue-700">✕</button>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.docx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <form onSubmit={enviar} className="flex gap-2 items-center">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder={isDemandante ? 'Descreva o objeto da contratacao...' : 'Faca sua pergunta sobre fluxos ou legislacao...'}
              className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
            {mode === 'analisar' && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="p-2.5 text-slate-400 hover:text-[#0a2f64] border border-slate-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition">
                <Paperclip size={17} />
              </button>
            )}
            <button type="submit"
              disabled={!input.trim() || analisando}
              style={{ backgroundColor: COLORS.primary }}
              className="p-2.5 text-white rounded-lg hover:bg-[#134084] disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm shrink-0">
              <Send size={17} />
            </button>
          </form>

          {mode === 'gerar' && (
            <button
              onClick={finalizar}
              disabled={!sessionId || finalizing}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition
                bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={13} />
              {finalizing ? 'Finalizando...' : 'Finalizar e gerar TR'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
