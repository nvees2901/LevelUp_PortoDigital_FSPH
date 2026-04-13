import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, FileText, Loader2, XCircle } from 'lucide-react';
import { streamChatMessage, sendChatMessage } from '../../services/api';
import type { TelaId, MensagemChat } from '../../types';

interface ChatViewProps {
  navegar: (tela: TelaId) => void;
}

export default function ChatView({ navegar }: ChatViewProps) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([
    { de: 'ia', texto: 'Olá! Sou o assistente de IA da FSPH treinado na Lei 14.133. Qual é o objeto da contratação que você deseja elaborar hoje?' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [generatedTermId, setGeneratedTermId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingTokensRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const enviarMensagem = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const textoUsuario = input.trim();
    setInput('');
    setSending(true);
    setError(null);

    setMensagens((prev) => [
      ...prev,
      { de: 'user', texto: textoUsuario },
      { de: 'ia', texto: '' },
    ]);

    try {
      await streamChatMessage(
        {
          message: textoUsuario,
          mode: 'gerar',
          session_id: sessionId || undefined,
        },
        {
          onToken: (token) => {
            setStreaming(true);
            pendingTokensRef.current += token;
            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(() => {
                const batch = pendingTokensRef.current;
                pendingTokensRef.current = '';
                flushTimerRef.current = null;
                setMensagens((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  const last = updated[lastIdx];
                  if (last && last.de === 'ia') {
                    updated[lastIdx] = { ...last, texto: last.texto + batch };
                  }
                  return updated;
                });
              }, 50);
            }
          },
          onDone: (meta) => {
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = null;
            }
            if (pendingTokensRef.current) {
              const remaining = pendingTokensRef.current;
              pendingTokensRef.current = '';
              setMensagens((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                const last = updated[lastIdx];
                if (last && last.de === 'ia') {
                  updated[lastIdx] = { ...last, texto: last.texto + remaining };
                }
                return updated;
              });
            }
            setSessionId(meta.session_id);
            if (meta.generated_term_id) {
              setGeneratedTermId(meta.generated_term_id);
            }
          },
          onError: () => {
            setMensagens((prev) => prev.slice(0, -1));
          },
        },
      );
    } catch {
      // Remove a mensagem vazia de streaming
      setMensagens((prev) => prev.slice(0, -1));

      // Fallback: tenta request normal (sem streaming)
      try {
        const response = await sendChatMessage({
          message: textoUsuario,
          mode: 'gerar',
          session_id: sessionId || undefined,
        });
        setSessionId(response.session_id);
        setMensagens((prev) => [...prev, { de: 'ia', texto: response.message }]);
        if (response.generated_term_id) {
          setGeneratedTermId(response.generated_term_id);
        }
      } catch {
        setError('Não foi possível conectar ao assistente de IA. Verifique se o backend está rodando.');
        // Remove a mensagem do user que ficou sem resposta
        setMensagens((prev) => prev.slice(0, -1));
      }
    } finally {
      setSending(false);
      setStreaming(false);
    }
  }, [input, sending, sessionId]);

  const isComplete = generatedTermId !== null;

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 bg-[#0a2f64] flex justify-between items-center rounded-t-xl text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg"><Bot size={20} /></div>
          <div>
            <h3 className="font-bold text-lg">Assistente IA de Elaboração</h3>
            <p className="text-xs text-blue-200">
              Geração guiada baseada na Lei 14.133/2021
              {sessionId && ` — Sessão ${sessionId.slice(0, 8)}...`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <XCircle size={16} />
            {error}
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'ia' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                m.de === 'ia'
                  ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                  : 'bg-[#0a2f64] text-white rounded-tr-none'
              }`}
            >
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.texto}</p>
            </div>
          </div>
        ))}

        {sending && !streaming && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-800 rounded-2xl rounded-tl-none border border-slate-100 p-4 shadow-sm">
              <Loader2 size={18} className="animate-spin text-[#0a2f64]" />
            </div>
          </div>
        )}

        {isComplete && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => navegar('lista')}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 shadow-lg transition transform hover:scale-105 flex items-center gap-2"
            >
              <FileText size={18} /> Visualizar Documento Gerado
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={enviarMensagem} className="p-4 border-t border-slate-200 bg-white rounded-b-xl flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isComplete || sending}
          placeholder="Digite sua resposta aqui..."
          className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] disabled:bg-slate-100 font-medium text-slate-700"
        />
        <button
          type="submit"
          disabled={!input.trim() || isComplete || sending}
          className="p-3 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
