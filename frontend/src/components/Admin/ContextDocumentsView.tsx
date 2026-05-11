import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Trash2, RefreshCw, Brain } from 'lucide-react';
import { COLORS } from '../../constants';
import {
  listContextDocuments,
  uploadContextDocument,
  deleteContextDocument,
} from '../../services/api';
import type { ContextDocument, TelaId } from '../../types';

interface ContextDocumentsViewProps {
  navegar: (tela: TelaId) => void;
}

export default function ContextDocumentsView({ navegar: _navegar }: ContextDocumentsViewProps) {
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const data = await listContextDocuments();
      setDocs(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Polling: refetch every 3s while any doc is 'pending'
  useEffect(() => {
    const hasPending = docs.some(d => d.status === 'pending');
    if (hasPending && !pollRef.current) {
      pollRef.current = window.setInterval(() => {
        fetchDocs();
      }, 3000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [docs, fetchDocs]);

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'doc'].includes(ext || '')) {
      setError('Formato não suportado. Use PDF, DOCX ou DOC.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadContextDocument(file);
      await fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContextDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover documento');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const StatusBadge = ({ status }: { status: ContextDocument['status'] }) => {
    const map = {
      pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
      indexed: { label: 'Indexado', cls: 'bg-emerald-100 text-emerald-700' },
      failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
    };
    const { label, cls } = map[status];
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.primary }}>
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-lg">Base de Conhecimento da IA</h1>
            <p className="text-sm text-slate-500">Documentos usados como contexto pelo assistente IA</p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`bg-white rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-[#0a2f64] bg-blue-50' : 'border-slate-300 hover:border-[#0a2f64]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-[#0a2f64]">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-medium">Enviando...</span>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-600">Arraste um arquivo ou clique para selecionar</p>
            <p className="text-xs text-slate-400 mt-1">PDF, DOCX, DOC — máx. 20 MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Documents table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {docs.length > 0 ? `${docs.length} documento(s)` : 'Nenhum documento carregado'}
          </p>
          <button onClick={fetchDocs} className="text-xs text-slate-400 hover:text-[#0a2f64] flex items-center gap-1">
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Nenhum documento na base de conhecimento.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Arquivo</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Tamanho</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Data</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className="text-slate-700 truncate max-w-xs" title={doc.original_filename}>
                        {doc.original_filename}
                      </span>
                      {doc.chunks_count !== null && (
                        <span className="text-xs text-slate-400">({doc.chunks_count} chunks)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatBytes(doc.size_bytes)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                    {doc.error_message && (
                      <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={doc.error_message}>
                        {doc.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(doc.uploaded_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remover documento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
