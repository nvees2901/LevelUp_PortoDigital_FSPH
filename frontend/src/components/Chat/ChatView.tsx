import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, FileText, Paperclip, Minus, Plus, X, Sparkles, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { streamChatMessage, finalizeChatSession, listChatSessions, getChatSession, uploadDocument, deleteChatSession, getTerm } from '../../services/api';
import type { TelaId, MensagemChat, ChatMode, ChatSessionSummary } from '../../types';
import { renderTexto } from '../../utils';

interface ChatViewProps {
  navegar: (tela: TelaId) => void;
  initialTermId?: string | null;
}

function renderMensagem(txt: string) {
  return txt.split('\n').map((line, i) => (
    <p key={i} className={line === '' ? 'h-1' : ''} dangerouslySetInnerHTML={{ __html: renderTexto(line) }} />
  ));
}

export default function ChatView({ navegar, initialTermId }: ChatViewProps) {
  const { usuario } = useAuth();
  const isDemandante = usuario?.id === 'demandante';

  function buildWelcome(): MensagemChat {
    return {
      de: 'ia',
      texto: isDemandante
        ? 'Olá! Sou o Assistente COLIC da FSPH, treinado na Lei 14.133/2021 e nos fluxos internos. Posso ajudar você a elaborar processos de contratação ou analisar documentos. Como posso ajudar?'
        : `Olá, ${usuario?.nomeUsuarioLogado}! Sou o Assistente COLIC. Posso responder dúvidas sobre fluxos da COLIC, modalidades de contratação, checklist documental e prazos legais. Como posso ajudar?`,
    };
  }

  const [msgs, setMsgs] = useState<MensagemChat[]>(() => [buildWelcome()]);
  const [input, setInput] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('consultar');
  const [finalizing, setFinalizing] = useState(false);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [attachedTermId, setAttachedTermId] = useState<string | null>(null);
  const [attachedTermTitle, setAttachedTermTitle] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [streamingText, setStreamingText] = useState('');
  const streamingTextRef = useRef('');

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, analisando]);

  const addMsg = (de: 'ia' | 'user', texto: string, extra: Partial<MensagemChat> = {}) =>
    setMsgs(prev => [...prev, { de, texto, ...extra }]);

  const loadSessions = useCallback(async (m: ChatMode) => {
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const res = await listChatSessions(m);
      setSessions(res.items);
    } catch {
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(mode); }, [mode, loadSessions]);

  useEffect(() => {
    if (!initialTermId) return;
    setMode('analisar');
    getTerm(initialTermId)
      .then(term => {
        setAttachedTermId(term.id);
        setAttachedTermTitle(term.title);
        addMsg('ia', `Processo "${term.title}" carregado. Faça perguntas ou peça ajustes.`);
      })
      .catch(() => {
        addMsg('ia', 'Não foi possível carregar o processo. Tente novamente.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTermId]);

  const loadSession = async (sid: string) => {
    setLoadingSession(true);
    try {
      const res = await getChatSession(sid);
      setSessionId(res.id);
      setMsgs(res.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ de: m.role === 'user' ? 'user' as const : 'ia' as const, texto: m.content }))
      );
      setAttachedTermId(null);
      setAttachedTermTitle(null);
    } catch {
      addMsg('ia', 'Não foi possível carregar a sessão.');
    } finally {
      setLoadingSession(false);
    }
  };

  const novaSessao = () => {
    setSessionId(null);
    setMsgs([buildWelcome()]);
    setAttachedTermId(null);
    setAttachedTermTitle(null);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteChatSession(id);
      if (id === sessionId) novaSessao();
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch {
      // ignora falha silenciosamente
    } finally {
      setConfirmDeleteId(null);
    }
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
    streamingTextRef.current = '';
    setStreamingText('');

    try {
      await streamChatMessage(
        { message: txt, mode, session_id: sessionId ?? undefined, term_id: attachedTermId ?? undefined },
        {
          onToken: (token) => {
            setAnalisando(false);
            streamingTextRef.current += token;
            setStreamingText(streamingTextRef.current);
          },
          onDone: (meta) => {
            const finalText = streamingTextRef.current;
            streamingTextRef.current = '';
            setStreamingText('');
            if (finalText) addMsg('ia', finalText);
            setSessionId(meta.session_id);
            loadSessions(mode);
          },
          onError: (err) => {
            streamingTextRef.current = '';
            setStreamingText('');
            addMsg('ia', err.message || 'Não foi possível contactar o assistente.');
          },
        }
      );
    } catch (err) {
      streamingTextRef.current = '';
      setStreamingText('');
      addMsg('ia', err instanceof Error ? err.message : 'Não foi possível contactar o assistente. Tente novamente.');
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
    <div className="max-w-4xl mx-auto flex card overflow-hidden shadow-card-md animate-fade-in"
      style={{ height: 'calc(100vh - 130px)' }}>

      {/* Sidebar */}
      <aside className="hidden sm:flex flex-col w-64 border-r border-slate-200 bg-slate-50/80">
        <div className="p-3 border-b border-slate-200">
          <button onClick={novaSessao} className="btn btn-primary btn-sm w-full">
            <Plus size={15} />
            Nova conversa
          </button>
        </div>
        <div className="px-3 pt-3 pb-1">
          <p className="section-title">Conversas</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessionsLoading ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-11 w-full" />)}
            </div>
          ) : sessionsError ? (
            <div className="text-xs text-red-500 text-center py-4">Erro ao carregar conversas.</div>
          ) : sessions.length === 0 ? (
            <div className="empty-state py-8">
              <MessageSquareText size={26} className="mb-2 text-slate-300" />
              <p className="text-xs">Nenhuma conversa anterior.</p>
            </div>
          ) : sessions.map(s => (
            <div
              key={s.id}
              className="relative"
              onMouseEnter={() => setHoveredSession(s.id)}
              onMouseLeave={() => { setHoveredSession(null); }}
            >
              {confirmDeleteId === s.id ? (
                <div className="flex items-center gap-1.5 px-2 py-2 rounded-lg bg-red-50 border border-red-200">
                  <span className="text-[11px] text-red-600 font-medium flex-1 truncate">Remover conversa?</span>
                  <button
                    onClick={() => handleDeleteSession(s.id)}
                    className="text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => loadSession(s.id)} disabled={loadingSession}
                    className={`w-full text-left px-3 py-2 pr-7 rounded-lg text-xs transition-colors disabled:opacity-60
                      ${s.id === sessionId
                        ? 'bg-brand-50 border border-brand-200 text-brand-primary font-semibold'
                        : 'text-slate-600 border border-transparent hover:bg-slate-100'}`}>
                    <p className="truncate font-medium">{s.title ?? `Sessão ${s.id.slice(0, 8)}`}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">{s.message_count} msg • {s.updated_at.slice(0, 10)}</p>
                  </button>
                  {hoveredSession === s.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                      title="Remover conversa"
                    >
                      <Minus size={11} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Chat panel */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="text-white bg-brand-primary">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/10 rounded-xl shrink-0"><Bot size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight">Assistente IA — COLIC/FSPH</p>
                <p className="text-xs text-brand-200 mt-0.5 truncate">
                  {isDemandante ? 'Elaboração guiada de processos' : 'Consulta sobre fluxos e legislação'} • Lei 14.133/2021 • Decreto 342/2023
                </p>
              </div>
              <div className="text-right text-xs hidden md:block shrink-0">
                <p className="font-semibold">{usuario?.nomeUsuarioLogado}</p>
                <p className="text-brand-200">{usuario?.subunidade ? usuario.subunidade.split('–')[0].trim() : usuario?.descricao}</p>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex flex-wrap gap-1.5">
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleModeChange(m.id)}
                  disabled={analisando}
                  className={`badge px-3 py-1 transition-colors border disabled:opacity-50 disabled:cursor-not-allowed
                    ${mode === m.id
                      ? 'bg-white text-brand-primary border-white'
                      : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
                    }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {/* Gov tricolor stripe */}
          <div className="flex h-1 w-full">
            <span className="flex-1 bg-gov-green" />
            <span className="flex-1 bg-gov-yellow" />
            <span className="flex-1 bg-gov-blue" />
          </div>
        </header>

        {/* Quick suggestions */}
        {msgs.length <= 1 && (
          <div className="p-4 border-b border-slate-100 bg-white">
            <p className="section-title mb-2.5">Perguntas frequentes</p>
            <div className="flex flex-wrap gap-2">
              {['Como funciona a Dispensa?', 'O que é o DFD?', 'Prazos contratuais', 'Fluxo COLIC/DIROP/DIRAF', 'O que é Inexigibilidade?'].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="badge badge-slate hover:bg-brand-50 hover:text-brand-primary transition-colors px-3 py-1.5">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50">
          {msgs.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 animate-fade-in ${m.de === 'ia' ? 'justify-start' : 'justify-end'}`}>
              {m.de === 'ia' && (
                <div className="hidden sm:flex shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white items-center justify-center mb-0.5">
                  <Bot size={15} />
                </div>
              )}
              <div className={`max-w-[80%] sm:max-w-[78%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-card space-y-0.5
                ${m.de === 'ia'
                  ? 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                  : 'bg-brand-primary text-white rounded-br-sm'}`}>
                {m.de === 'ia' ? renderMensagem(m.texto) : <p>{m.texto}</p>}
              </div>
            </div>
          ))}

          {analisando && !streamingText && (
            <div className="flex items-end gap-2 justify-start animate-fade-in">
              <div className="hidden sm:flex shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white items-center justify-center mb-0.5">
                <Bot size={15} />
              </div>
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-card flex items-center gap-2.5 text-xs text-slate-400">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                Aguardando resposta...
              </div>
            </div>
          )}

          {streamingText && (
            <div className="flex items-end gap-2 justify-start animate-fade-in">
              <div className="hidden sm:flex shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white items-center justify-center mb-0.5">
                <Bot size={15} />
              </div>
              <div className="max-w-[80%] sm:max-w-[78%] px-4 py-2.5 rounded-2xl rounded-bl-sm text-[13px] leading-relaxed shadow-card bg-white border border-slate-200 text-slate-700">
                {renderMensagem(streamingText)}
                <span className="inline-block w-0.5 h-3.5 bg-brand-primary ml-0.5 animate-pulse align-middle" />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white space-y-2.5">

          {/* Attachment chip */}
          {attachedTermId && (
            <div className="flex items-center gap-2 px-3 py-2 badge badge-blue w-full justify-start animate-scale-in">
              <FileText size={14} className="shrink-0" />
              <span className="font-medium truncate">{attachedTermTitle ?? attachedTermId}</span>
              <button onClick={() => { setAttachedTermId(null); setAttachedTermTitle(null); }}
                aria-label="Remover anexo"
                className="ml-auto text-brand-400 hover:text-brand-primary transition-colors shrink-0">
                <X size={14} />
              </button>
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
              placeholder={isDemandante ? 'Descreva o objeto da contratação...' : 'Faça sua pergunta sobre fluxos ou legislação...'}
              className="input flex-1" />
            {mode === 'analisar' && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                aria-label="Anexar documento"
                className="btn btn-ghost btn-sm shrink-0">
                <Paperclip size={17} />
              </button>
            )}
            <button type="submit"
              disabled={!input.trim() || analisando || uploadingFile}
              aria-label="Enviar mensagem"
              className="btn btn-primary btn-sm shrink-0">
              <Send size={17} />
            </button>
          </form>

          {mode === 'gerar' && (
            <button
              onClick={finalizar}
              disabled={!sessionId || finalizing}
              className="btn btn-primary btn-sm w-full bg-gov-green hover:bg-emerald-700"
            >
              <Sparkles size={15} />
              {finalizing ? 'Finalizando...' : 'Finalizar e gerar TR'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
