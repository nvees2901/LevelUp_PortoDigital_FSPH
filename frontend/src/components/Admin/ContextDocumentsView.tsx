import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload, FileText, Trash2, RefreshCw, Brain, CheckCircle2,
  Clock, AlertCircle, Download, AlertTriangle, ChevronDown,
  ChevronRight, Scale, FileCheck, FolderOpen, X, Power, PowerOff, Eye,
} from 'lucide-react';
import { formatDate } from '../../utils';
import {
  listContextDocuments,
  uploadContextDocument,
  deleteContextDocument,
  reindexContextDocument,
  downloadContextDocument,
  getKnowledgeBaseCollections,
  activateContextDocument,
  deactivateContextDocument,
  createTextContextDocument,
  previewContextDocument,
  fetchContextDocumentBlob,
} from '../../services/api';
import type { ContextDocument, ContextDocumentPreviewResponse, KnowledgeBaseCollection, TelaId } from '../../types';

interface ContextDocumentsViewProps {
  navegar: (tela: TelaId) => void;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContextDocument['status'] }) {
  const map = {
    pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
    indexed: { label: 'Indexado', cls: 'bg-emerald-100 text-emerald-700' },
    failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ─── StatsHeader ─────────────────────────────────────────────────────────────

function StatsHeader({ docs }: { docs: ContextDocument[] }) {
  const stats = useMemo(() => {
    const indexed = docs.filter(d => d.status === 'indexed');
    const pending = docs.filter(d => d.status === 'pending');
    const failed = docs.filter(d => d.status === 'failed');
    const totalChunks = indexed.reduce((sum, d) => sum + (d.chunks_count ?? 0), 0);
    const totalSize = docs.reduce((sum, d) => sum + d.size_bytes, 0);
    return { total: docs.length, indexed: indexed.length, pending: pending.length, failed: failed.length, totalChunks, totalSize };
  }, [docs]);

  const cards = [
    {
      label: 'Total de documentos',
      value: stats.total,
      sub: formatBytes(stats.totalSize),
      icon: <FileText size={18} className="text-slate-500" />,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
    },
    {
      label: 'Indexados',
      value: stats.indexed,
      sub: `${stats.totalChunks} chunks`,
      icon: <CheckCircle2 size={18} className="text-emerald-600" />,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      label: 'Em indexação',
      value: stats.pending,
      sub: stats.pending > 0 ? 'atualizando...' : 'nenhum pendente',
      icon: <Clock size={18} className="text-amber-500" />,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      label: 'Com falha',
      value: stats.failed,
      sub: stats.failed > 0 ? 'clique em Re-indexar' : 'tudo ok',
      icon: <AlertCircle size={18} className="text-red-500" />,
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs text-slate-500 font-medium">{c.label}</span></div>
          <p className="text-2xl font-bold text-slate-800">{c.value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── UploadZone ──────────────────────────────────────────────────────────────

interface QueueItem {
  file: File;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

const COLLECTION_OPTIONS = [
  { value: 'context_extra', label: 'Documentos Adicionais' },
  { value: 'lei_14133', label: 'Lei 14.133/2021' },
  { value: 'termos_aprovados', label: 'TRs Aprovados FSPH' },
] as const;

type CollectionKey = typeof COLLECTION_OPTIONS[number]['value'];

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [collection, setCollection] = useState<CollectionKey>('context_extra');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE_MB = 20;

  const processFiles = async (files: File[]) => {
    const isValidExt = (f: File) => ['pdf', 'docx', 'doc'].includes(f.name.split('.').pop()?.toLowerCase() || '');
    const typeInvalid = files.filter(f => !isValidExt(f));
    const typeValid = files.filter(isValidExt);
    const tooLarge = typeValid.filter(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    const valid = typeValid.filter(f => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);

    const initial: QueueItem[] = [
      ...typeInvalid.map(f => ({ file: f, status: 'error' as const, error: 'Formato não suportado. Use PDF, DOCX ou DOC.' })),
      ...tooLarge.map(f => ({ file: f, status: 'error' as const, error: `Arquivo excede ${MAX_FILE_SIZE_MB} MB.` })),
      ...valid.map(f => ({ file: f, status: 'uploading' as const })),
    ];

    if (initial.length === 0) return;

    setQueue(initial);

    if (valid.length === 0) {
      setTimeout(() => setQueue([]), 4000);
      return;
    }

    const errOffset = typeInvalid.length + tooLarge.length;
    const results = await Promise.allSettled(valid.map(f => uploadContextDocument(f, collection)));

    setQueue(prev =>
      prev.map((item, i) => {
        if (i < errOffset) return item;
        const result = results[i - errOffset];
        if (result.status === 'fulfilled') return { ...item, status: 'done' };
        const msg = result.reason instanceof Error ? result.reason.message : 'Erro no upload';
        return { ...item, status: 'error', error: msg };
      })
    );

    onUploaded();

    setTimeout(() => setQueue([]), 3000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const isUploading = queue.some(q => q.status === 'uploading');

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-500 shrink-0">Base de destino:</label>
        <select
          value={collection}
          onChange={e => setCollection(e.target.value as CollectionKey)}
          disabled={isUploading}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
        >
          {COLLECTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`bg-white rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isUploading ? 'cursor-default border-slate-200' :
          dragOver ? 'border-brand-primary bg-blue-50 cursor-copy' : 'border-slate-300 hover:border-brand-primary cursor-pointer'
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" multiple className="hidden" onChange={handleChange} />
        <Upload size={32} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-600">Arraste arquivos ou clique para selecionar</p>
        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, DOC — máx. 20 MB por arquivo — múltiplos arquivos suportados</p>
      </div>

      {queue.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {queue.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              {item.status === 'uploading' && <RefreshCw size={14} className="text-brand-primary animate-spin shrink-0" />}
              {item.status === 'done' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
              {item.status === 'error' && <AlertCircle size={14} className="text-red-500 shrink-0" />}
              <span className="text-sm text-slate-700 truncate flex-1">{item.file.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{formatBytes(item.file.size)}</span>
              {item.error && <span className="text-xs text-red-500 truncate max-w-[160px]" title={item.error}>{item.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TextInputZone ────────────────────────────────────────────────────────────

function TextInputZone({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [collection, setCollection] = useState<CollectionKey>('context_extra');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    const contentBytes = new Blob([content]).size;
    if (contentBytes > MAX_BYTES) {
      setError(`Texto muito grande: ${(contentBytes / 1024 / 1024).toFixed(1)} MB. Máximo: 20 MB.`);
      return;
    }

    setLoading(true);
    try {
      await createTextContextDocument(title, content, collection);
      setTitle('');
      setContent('');
      setCollection('context_extra');
      setSuccess(true);
      onAdded();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar texto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-500 shrink-0">Base de destino:</label>
        <select
          value={collection}
          onChange={e => setCollection(e.target.value as CollectionKey)}
          disabled={loading}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
        >
          {COLLECTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Título</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={loading}
            placeholder="Ex: Política de Compras 2024"
            minLength={3}
            maxLength={200}
            required
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Conteúdo</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={loading}
            placeholder="Cole ou digite o texto que será indexado na base de conhecimento..."
            minLength={10}
            required
            rows={6}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50 resize-y"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          {error && (
            <p className="text-xs text-red-500 flex-1">{error}</p>
          )}
          {success && !error && (
            <span className="text-xs text-emerald-600 flex items-center gap-1 flex-1">
              <CheckCircle2 size={12} /> Texto adicionado com sucesso
            </span>
          )}
          {!error && !success && <span className="flex-1" />}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Enviando...</>
              : <><FileText size={14} /> Adicionar à base de conhecimento</>
            }
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  doc,
  onConfirm,
  onCancel,
}: {
  doc: ContextDocument;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const confirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-red-50 rounded-lg shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Remover documento</h3>
            <p className="text-sm text-slate-500 mt-1">
              Tem certeza que deseja remover <span className="font-medium text-slate-700">"{doc.original_filename}"</span>?
              Os chunks serão removidos da base de conhecimento da IA.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={deleting} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={deleting}
            className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            {deleting ? <><RefreshCw size={14} className="animate-spin" /> Removendo...</> : <><Trash2 size={14} /> Remover</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DocumentPreviewModal ─────────────────────────────────────────────────────

interface DocumentPreviewModalProps {
  doc: ContextDocument | null;
  onClose: () => void;
}

function DocumentPreviewModal({ doc, onClose }: DocumentPreviewModalProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState<ContextDocumentPreviewResponse | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!doc) return;
    setState('loading');
    setPreview(null);
    setBlobUrl(null);
    setErrorMsg('');

    if (doc.mime_type === 'application/pdf') {
      fetchContextDocumentBlob(doc.id)
        .then(blob => {
          setBlobUrl(URL.createObjectURL(blob));
          setState('ready');
        })
        .catch(() => {
          setErrorMsg('Não foi possível carregar o PDF.');
          setState('error');
        });
    } else {
      previewContextDocument(doc.id)
        .then(data => {
          setPreview(data);
          setState('ready');
        })
        .catch(() => {
          setErrorMsg('Não foi possível carregar a prévia.');
          setState('error');
        });
    }
  }, [doc]);

  // Revogar blob URL ao fechar para liberar memória
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!doc) return null;

  const collectionLabel: Record<string, string> = {
    context_extra: 'Adicional',
    lei_14133: 'Lei 14.133',
    termos_aprovados: 'TRs Aprovados',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <FileText size={16} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{doc.original_filename}</p>
            <p className="text-xs text-slate-400">{collectionLabel[doc.collection] ?? doc.collection}</p>
          </div>
          <button
            onClick={() => downloadContextDocument(doc.id, doc.original_filename)}
            title="Baixar arquivo original"
            className="p-2 text-slate-400 hover:text-brand-primary hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Download size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {state === 'loading' && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-primary border-t-transparent" />
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-center justify-center h-64 text-sm text-red-500 gap-2">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}

          {state === 'ready' && doc.mime_type === 'application/pdf' && blobUrl && (
            <iframe
              src={blobUrl}
              className="w-full h-full"
              style={{ minHeight: '70vh' }}
              title={doc.original_filename}
            />
          )}

          {state === 'ready' && preview && (
            <div className="h-full overflow-y-auto p-5">
              {preview.truncated && (
                <div className="mb-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} />
                  Exibindo apenas os primeiros 3.000 caracteres.
                </div>
              )}
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                {preview.text}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DocumentList ─────────────────────────────────────────────────────────────

const COLLECTION_ICONS: Record<string, React.ReactNode> = {
  lei_14133: <Scale size={14} className="text-blue-600 shrink-0" />,
  termos_aprovados: <FileCheck size={14} className="text-violet-600 shrink-0" />,
  context_extra: <FolderOpen size={14} className="text-slate-400 shrink-0" />,
};

const COLLECTION_LABELS: Record<string, string> = {
  lei_14133: 'Lei 14.133',
  termos_aprovados: 'TRs Aprovados',
  context_extra: 'Adicionais',
};

type StatusFilter = 'all' | 'indexed' | 'pending' | 'failed';

function DocumentList({
  docs,
  loading,
  onRefresh,
  onDelete,
  onRetry,
  onDownload,
  onToggleActive,
  onPreview,
}: {
  docs: ContextDocument[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (doc: ContextDocument) => void;
  onRetry: (doc: ContextDocument) => void;
  onDownload: (doc: ContextDocument) => void;
  onToggleActive: (doc: ContextDocument) => void;
  onPreview: (doc: ContextDocument) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    return docs.filter(d => {
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      const matchesSearch = d.original_filename.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [docs, search, statusFilter]);

  const filterPills: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'indexed', label: 'Indexados' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'failed', label: 'Falhos' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-primary transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {filterPills.map(p => (
              <button
                key={p.key}
                onClick={() => setStatusFilter(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  statusFilter === p.key
                    ? 'bg-brand-primary text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {p.label}
                {p.key !== 'all' && docs.filter(d => d.status === p.key).length > 0 && (
                  <span className="ml-1 opacity-75">({docs.filter(d => d.status === p.key).length})</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={onRefresh} className="text-xs text-slate-400 hover:text-brand-primary flex items-center gap-1 ml-auto shrink-0">
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
      ) : docs.length === 0 ? (
        <div className="p-10 text-center">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Nenhum documento na base de conhecimento</p>
          <p className="text-xs text-slate-400 mt-1">Faça upload de um PDF, DOCX ou DOC acima</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-slate-400">Nenhum documento encontrado para "{search}"</p>
          <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="text-xs text-brand-primary mt-2 hover:underline">
            Limpar filtros
          </button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Arquivo</th>
              <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Base</th>
              <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Tamanho</th>
              <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Status</th>
              <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Data</th>
              <th className="px-4 py-2.5 text-xs text-slate-500 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(doc => (
              <tr key={doc.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${!doc.is_active ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <span className="text-slate-700 truncate max-w-xs" title={doc.original_filename}>
                      {doc.original_filename}
                    </span>
                    {doc.is_seed && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                        Seed
                      </span>
                    )}
                    {doc.chunks_count !== null && doc.chunks_count > 0 && (
                      <span className="text-xs text-slate-400 shrink-0">({doc.chunks_count} chunks)</span>
                    )}
                  </div>
                  {doc.error_message && (
                    <p className="text-xs text-red-500 mt-0.5 ml-5 truncate max-w-[280px]" title={doc.error_message}>
                      {doc.error_message}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {COLLECTION_ICONS[doc.collection] ?? <FolderOpen size={14} className="text-slate-400 shrink-0" />}
                    <span className="text-xs text-slate-500">{COLLECTION_LABELS[doc.collection] ?? doc.collection}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{formatBytes(doc.size_bytes)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={doc.status} />
                    {!doc.is_active && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Inativo</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {formatDate(doc.uploaded_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => onPreview(doc)}
                      title="Pré-visualizar documento"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => onDownload(doc)}
                      title="Baixar arquivo original"
                      className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-blue-50 rounded transition-colors"
                    >
                      <Download size={14} />
                    </button>
                    {doc.is_active && (
                      <button
                        onClick={() => onRetry(doc)}
                        disabled={doc.status === 'pending'}
                        title={doc.status === 'pending' ? 'Em indexação...' : 'Re-indexar documento'}
                        className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          doc.status === 'failed'
                            ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    {(doc.is_active && doc.status === 'indexed') && (
                      <button
                        onClick={() => onToggleActive(doc)}
                        title="Desativar TR (remove chunks do ChromaDB)"
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                      >
                        <PowerOff size={14} />
                      </button>
                    )}
                    {!doc.is_active && (
                      <button
                        onClick={() => onToggleActive(doc)}
                        title="Reativar TR (re-indexa no ChromaDB)"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                      >
                        <Power size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(doc)}
                      title="Remover documento"
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── FixedCollections ─────────────────────────────────────────────────────────

function FixedCollections() {
  const [expanded, setExpanded] = useState(false);
  const [collections, setCollections] = useState<KnowledgeBaseCollection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    getKnowledgeBaseCollections()
      .then(data => setCollections(data.items))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [expanded]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Bases de conhecimento fixas</span>
          <span className="text-xs text-slate-400 ml-1">(Lei 14.133, TRs aprovados e mais)</span>
        </div>
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Carregando...
            </div>
          ) : collections.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              ChromaDB indisponível — estatísticas não carregadas.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {collections.map(col => (
                <div key={col.name} className="flex items-start gap-3 px-5 py-4">
                  {COLLECTION_ICONS[col.name] ?? <FolderOpen size={14} className="text-slate-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{col.display_name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{col.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-semibold text-slate-700">
                      {col.chunks_count !== null ? col.chunks_count.toLocaleString('pt-BR') : '—'}
                    </span>
                    <p className="text-xs text-slate-400">chunks</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente raiz ──────────────────────────────────────────────────────────

export default function ContextDocumentsView({ navegar: _navegar }: ContextDocumentsViewProps) {
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContextDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ContextDocument | null>(null);
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
      pollRef.current = window.setInterval(() => { fetchDocs(); }, 3000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [docs, fetchDocs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContextDocument(deleteTarget.id);
      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover documento');
      setDeleteTarget(null);
    }
  };

  const handleRetry = async (doc: ContextDocument) => {
    setError(null);
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'pending', error_message: null, chunks_count: null } : d));
    try {
      await reindexContextDocument(doc.id);
      await fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao re-indexar documento');
      await fetchDocs();
    }
  };

  const handleDownload = async (doc: ContextDocument) => {
    setError(null);
    try {
      await downloadContextDocument(doc.id, doc.original_filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar arquivo');
    }
  };

  const handleToggleActive = async (doc: ContextDocument) => {
    setError(null);
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'pending' } : d));
    try {
      const updated = doc.is_active
        ? await deactivateContextDocument(doc.id)
        : await activateContextDocument(doc.id);
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar estado do documento');
      await fetchDocs();
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-primary">
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-lg">Base de Conhecimento IA</h1>
            <p className="text-sm text-slate-500">Documentos usados como contexto pelo assistente IA</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsHeader docs={docs} />

      {/* Upload */}
      <UploadZone onUploaded={fetchDocs} />

      {/* Text input */}
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400 shrink-0">ou adicione texto diretamente</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <TextInputZone onAdded={fetchDocs} />

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {/* Documents */}
      <DocumentList
        docs={docs}
        loading={loading}
        onRefresh={fetchDocs}
        onDelete={setDeleteTarget}
        onRetry={handleRetry}
        onDownload={handleDownload}
        onToggleActive={handleToggleActive}
        onPreview={doc => setPreviewDoc(doc)}
      />

      {/* Fixed collections */}
      <FixedCollections />

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          doc={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Preview modal */}
      <DocumentPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}
