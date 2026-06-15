import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload, FileText, Trash2, RefreshCw, Brain, CheckCircle2,
  Clock, AlertCircle, Download, AlertTriangle, ChevronDown,
  ChevronRight, FileCheck, FolderOpen, X, Power, PowerOff, Eye, Search, Plus,
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
    pending: { label: 'Pendente', cls: 'badge-amber', icon: <Clock size={11} /> },
    indexed: { label: 'Indexado', cls: 'badge-green', icon: <CheckCircle2 size={11} /> },
    failed: { label: 'Falhou', cls: 'badge-red', icon: <AlertCircle size={11} /> },
  };
  const { label, cls, icon } = map[status];
  return <span className={`badge ${cls}`}>{icon}{label}</span>;
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
      icon: <FileText size={20} className="text-brand-primary" />,
      iconBg: 'bg-brand-50',
    },
    {
      label: 'Indexados',
      value: stats.indexed,
      sub: `${stats.totalChunks} chunks`,
      icon: <CheckCircle2 size={20} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Em indexação',
      value: stats.pending,
      sub: stats.pending > 0 ? 'atualizando...' : 'nenhum pendente',
      icon: <Clock size={20} className="text-amber-500" />,
      iconBg: 'bg-amber-50',
    },
    {
      label: 'Com falha',
      value: stats.failed,
      sub: stats.failed > 0 ? 'clique em Re-indexar' : 'tudo ok',
      icon: <AlertCircle size={20} className="text-red-500" />,
      iconBg: 'bg-red-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="card card-hover p-5 flex items-start gap-4">
          <div className={`p-2.5 rounded-xl ${c.iconBg} shrink-0`}>{c.icon}</div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-slate-800 leading-tight">{c.value}</p>
            <p className="text-xs font-medium text-slate-600 mt-0.5">{c.label}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
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
  { value: 'prompt', label: 'Prompt (instruções e contexto da IA)' },
  { value: 'tr', label: 'Termos de Referência Aprovados' },
] as const;

type CollectionKey = typeof COLLECTION_OPTIONS[number]['value'];

function UploadZone({ onUploaded, fixedCollection }: { onUploaded: () => void; fixedCollection?: CollectionKey }) {
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [collection, setCollection] = useState<CollectionKey>(fixedCollection ?? 'prompt');
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
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Upload size={16} className="text-brand-primary" />
        <h2 className="section-title">Enviar arquivos</h2>
      </div>

      {!fixedCollection && (
        <div>
          <label className="label">Base de destino</label>
          <select
            value={collection}
            onChange={e => setCollection(e.target.value as CollectionKey)}
            disabled={isUploading}
            className="input disabled:opacity-50"
          >
            {COLLECTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
          isUploading ? 'cursor-default border-slate-200 bg-slate-50' :
          dragOver ? 'border-brand-primary bg-brand-50 cursor-copy' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 cursor-pointer'
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" multiple className="hidden" onChange={handleChange} />
        <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-3">
          <Upload size={22} className="text-brand-primary" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Arraste arquivos ou clique para selecionar</p>
        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, DOC — máx. 20 MB por arquivo — múltiplos arquivos suportados</p>
      </div>

      {queue.length > 0 && (
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden animate-fade-in">
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
  const [collection, setCollection] = useState<CollectionKey>('prompt');
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
      setCollection('prompt');
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
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Plus size={16} className="text-brand-primary" />
        <h2 className="section-title">Adicionar texto</h2>
      </div>

      <div>
        <label className="label">Base de destino</label>
        <select
          value={collection}
          onChange={e => setCollection(e.target.value as CollectionKey)}
          disabled={loading}
          className="input disabled:opacity-50"
        >
          {COLLECTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Título</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={loading}
          placeholder="Ex: Política de Compras 2024"
          minLength={3}
          maxLength={200}
          required
          className="input disabled:opacity-50"
        />
      </div>

      <div>
        <label className="label">Conteúdo</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={loading}
          placeholder="Cole ou digite o texto que será indexado na base de conhecimento..."
          minLength={10}
          required
          rows={6}
          className="input resize-y disabled:opacity-50"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1 flex-1">
            <AlertCircle size={12} className="shrink-0" /> {error}
          </p>
        )}
        {success && !error && (
          <span className="text-xs text-emerald-600 flex items-center gap-1 flex-1">
            <CheckCircle2 size={12} /> Texto adicionado com sucesso
          </span>
        )}
        {!error && !success && <span className="flex-1" />}
        <button type="submit" disabled={loading} className="btn btn-primary btn-md shrink-0">
          {loading
            ? <><RefreshCw size={14} className="animate-spin" /> Enviando...</>
            : <><FileText size={14} /> Adicionar à base de conhecimento</>
          }
        </button>
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
    <div className="fixed inset-0 bg-brand-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div className="card shadow-card-lg max-w-sm w-full p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2.5 bg-red-50 rounded-xl shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Remover documento</h3>
            <p className="text-sm text-slate-500 mt-1">
              Tem certeza que deseja remover <span className="font-medium text-slate-700">"{doc.original_filename}"</span>?
              Os chunks serão removidos da base de conhecimento da IA.
            </p>
            {doc.is_seed && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Este é um documento da base fixa. Após a remoção, ele não será restaurado automaticamente — você precisará fazer o upload novamente.</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={deleting} className="btn btn-ghost btn-sm">
            Cancelar
          </button>
          <button onClick={confirm} disabled={deleting} className="btn btn-danger btn-sm">
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
    prompt: 'Prompt',
    tr: 'TR',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/50 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card shadow-card-lg w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="p-2 rounded-lg bg-brand-50 shrink-0">
            <FileText size={16} className="text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{doc.original_filename}</p>
            <p className="text-xs text-slate-400">{collectionLabel[doc.collection] ?? doc.collection}</p>
          </div>
          <button
            onClick={() => downloadContextDocument(doc.id, doc.original_filename)}
            title="Baixar arquivo original"
            className="btn btn-ghost btn-xs"
          >
            <Download size={15} />
          </button>
          <button onClick={onClose} title="Fechar" className="btn btn-ghost btn-xs">
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
  prompt: <FolderOpen size={13} className="text-brand-primary shrink-0" />,
  tr: <FileCheck size={13} className="text-violet-600 shrink-0" />,
};

const COLLECTION_BADGES: Record<string, string> = {
  prompt: 'badge-blue',
  tr: 'badge-violet',
};

const COLLECTION_LABELS: Record<string, string> = {
  prompt: 'Prompt',
  tr: 'Termos Aprovados',
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
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-icon py-2"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Limpar busca">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {filterPills.map(p => {
              const count = p.key !== 'all' ? docs.filter(d => d.status === p.key).length : 0;
              return (
                <button
                  key={p.key}
                  onClick={() => setStatusFilter(p.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                    statusFilter === p.key
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                  {p.key !== 'all' && count > 0 && (
                    <span className="ml-1 opacity-75">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={onRefresh} className="btn btn-ghost btn-xs ml-auto shrink-0">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-1/3" />
                <div className="skeleton h-2.5 w-1/5" />
              </div>
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={26} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Nenhum documento na base de conhecimento</p>
          <p className="text-xs text-slate-400 mt-1">Faça upload de um PDF, DOCX ou DOC acima</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <Search size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhum documento encontrado para "{search}"</p>
          <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="btn btn-ghost btn-xs mt-2">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Arquivo</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Base</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Tamanho</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Data</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id} className={`border-b border-slate-50 last:border-0 hover:bg-brand-50/40 transition-colors ${!doc.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <button
                        onClick={() => onPreview(doc)}
                        className="font-medium text-brand-primary hover:underline truncate max-w-xs text-left"
                        title={`Visualizar: ${doc.original_filename}`}
                      >
                        {doc.original_filename}
                      </button>
                      {doc.is_seed && (
                        <span className="badge badge-blue shrink-0">Seed</span>
                      )}
                      {doc.chunks_count !== null && doc.chunks_count > 0 && (
                        <span className="text-xs text-slate-400 shrink-0">({doc.chunks_count} chunks)</span>
                      )}
                    </div>
                    {doc.error_message && (
                      <p className="text-xs text-red-500 mt-1 ml-6 truncate max-w-[280px]" title={doc.error_message}>
                        {doc.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${COLLECTION_BADGES[doc.collection] ?? 'badge-slate'}`}>
                      {COLLECTION_ICONS[doc.collection] ?? <FolderOpen size={13} className="shrink-0" />}
                      {COLLECTION_LABELS[doc.collection] ?? doc.collection}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatBytes(doc.size_bytes)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={doc.status} />
                      {!doc.is_active && (
                        <span className="badge badge-slate">Inativo</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {formatDate(doc.uploaded_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => onPreview(doc)}
                        title="Pré-visualizar documento"
                        className="btn btn-ghost btn-xs"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => onDownload(doc)}
                        title="Baixar arquivo original"
                        className="btn btn-ghost btn-xs"
                      >
                        <Download size={14} />
                      </button>
                      {doc.is_active && (
                        <button
                          onClick={() => onRetry(doc)}
                          disabled={doc.status === 'pending'}
                          title={doc.status === 'pending' ? 'Em indexação...' : 'Re-indexar documento'}
                          className="btn btn-ghost btn-xs"
                        >
                          <RefreshCw size={14} className={doc.status === 'failed' ? 'text-amber-500' : ''} />
                        </button>
                      )}
                      {(doc.is_active && doc.status === 'indexed') && (
                        <button
                          onClick={() => onToggleActive(doc)}
                          title="Desativar TR (remove chunks do ChromaDB)"
                          className="btn btn-ghost btn-xs"
                        >
                          <PowerOff size={14} />
                        </button>
                      )}
                      {!doc.is_active && (
                        <button
                          onClick={() => onToggleActive(doc)}
                          title="Reativar TR (re-indexa no ChromaDB)"
                          className="btn btn-ghost btn-xs"
                        >
                          <Power size={14} className="text-emerald-600" />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(doc)}
                        title="Remover documento"
                        className="btn btn-danger btn-xs"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── FixedCollections ─────────────────────────────────────────────────────────

interface FixedCollectionsProps {
  trDocs: ContextDocument[];
  otherFixedDocs: ContextDocument[];
  onDelete: (doc: ContextDocument) => void;
  onPreview: (doc: ContextDocument) => void;
  onUploaded: () => void;
}

function FixedCollections({ trDocs, otherFixedDocs, onDelete, onPreview, onUploaded }: FixedCollectionsProps) {
  const [expanded, setExpanded] = useState(false);
  const [collections, setCollections] = useState<KnowledgeBaseCollection[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showTrUpload, setShowTrUpload] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoadingStats(true);
    getKnowledgeBaseCollections()
      .then(data => setCollections(data.items))
      .catch(() => setCollections([]))
      .finally(() => setLoadingStats(false));
  }, [expanded]);

  const totalFixed = trDocs.length + otherFixedDocs.length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-brand-50">
            <Brain size={16} className="text-brand-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-700">Bases de conhecimento fixas</span>
            <span className="text-xs text-slate-400 ml-1.5">
              ({totalFixed} documento{totalFixed !== 1 ? 's' : ''} — Lei 14.133, TRs aprovados e mais)
            </span>
          </div>
        </div>
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 animate-fade-in divide-y divide-slate-100">

          {/* ── Estatísticas ChromaDB ── */}
          <div className="px-5 py-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Estatísticas ChromaDB</p>
            {loadingStats ? (
              <div className="text-xs text-slate-400 flex items-center gap-2 py-2">
                <RefreshCw size={12} className="animate-spin" /> Carregando estatísticas...
              </div>
            ) : collections.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">ChromaDB indisponível — estatísticas não carregadas.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {collections.map(col => (
                  <div key={col.name} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <div className="p-1 rounded bg-white border border-slate-200 shrink-0">
                      {COLLECTION_ICONS[col.name] ?? <FolderOpen size={12} className="text-slate-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700 truncate">{col.display_name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-bold text-slate-700">
                        {col.chunks_count !== null ? col.chunks_count.toLocaleString('pt-BR') : '—'}
                      </span>
                      <p className="text-xs text-slate-400 leading-none">chunks</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Termos de Referência Aprovados ── */}
          <div>
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <FileCheck size={14} className="text-violet-600" />
                <span className="text-sm font-semibold text-slate-700">Termos de Referência Aprovados</span>
                <span className="badge badge-violet">{trDocs.length}</span>
              </div>
              <button
                onClick={() => setShowTrUpload(v => !v)}
                className="btn btn-ghost btn-xs"
                title="Adicionar termo à base fixa"
              >
                {showTrUpload ? <X size={13} /> : <Plus size={13} />}
                {showTrUpload ? 'Cancelar' : 'Adicionar Termo'}
              </button>
            </div>

            {showTrUpload && (
              <div className="px-5 pb-4">
                <UploadZone
                  fixedCollection="tr"
                  onUploaded={() => {
                    setShowTrUpload(false);
                    onUploaded();
                  }}
                />
              </div>
            )}

            {trDocs.length === 0 ? (
              <p className="px-5 pb-4 text-xs text-slate-400">
                Nenhum termo aprovado na base fixa. Clique em "Adicionar Termo" para enviar um documento.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {trDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <FileCheck size={14} className="text-violet-500 shrink-0" />
                    <button
                      onClick={() => onPreview(doc)}
                      className="flex-1 text-sm text-brand-primary hover:underline text-left truncate"
                      title={`Visualizar: ${doc.original_filename}`}
                    >
                      {doc.original_filename}
                    </button>
                    <span className="text-xs text-slate-400 shrink-0">{formatBytes(doc.size_bytes)}</span>
                    <StatusBadge status={doc.status} />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onPreview(doc)}
                        title="Pré-visualizar"
                        className="btn btn-ghost btn-xs"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => onDelete(doc)}
                        title="Remover da base fixa"
                        className="btn btn-danger btn-xs"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Outros documentos fixos (Lei, contexto) ── */}
          {otherFixedDocs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-5 py-3">
                <FolderOpen size={14} className="text-brand-primary" />
                <span className="text-sm font-semibold text-slate-700">Outros documentos fixos</span>
                <span className="badge badge-blue">{otherFixedDocs.length}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {otherFixedDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <FileText size={14} className="text-brand-primary shrink-0" />
                    <button
                      onClick={() => onPreview(doc)}
                      className="flex-1 text-sm text-brand-primary hover:underline text-left truncate"
                      title={`Visualizar: ${doc.original_filename}`}
                    >
                      {doc.original_filename}
                    </button>
                    <span className="text-xs text-slate-400 shrink-0">{formatBytes(doc.size_bytes)}</span>
                    <StatusBadge status={doc.status} />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onPreview(doc)}
                        title="Pré-visualizar"
                        className="btn btn-ghost btn-xs"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => onDelete(doc)}
                        title="Remover da base fixa"
                        className="btn btn-danger btn-xs"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

  // TR docs (seeds + uploaded) → seção "Termos de Referência Aprovados"
  const trDocs = useMemo(() => docs.filter(d => d.collection === 'tr'), [docs]);
  // Outros seeds (Lei 14.133, etc.) → seção "Outros documentos fixos"
  const otherFixedDocs = useMemo(() => docs.filter(d => d.collection !== 'tr' && d.is_seed), [docs]);
  // Apenas uploads de prompt (não-seed) → lista principal
  const uploadedDocs = useMemo(() => docs.filter(d => d.collection !== 'tr' && !d.is_seed), [docs]);

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
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-brand-primary shadow-sm">
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-xl">Base de Conhecimento IA</h1>
            <p className="text-sm text-slate-500 mt-0.5">Documentos usados como contexto pelo assistente IA</p>
          </div>
        </div>
      </div>

      {/* Stats — all docs including seeds */}
      <StatsHeader docs={docs} />

      {/* Entrada de documentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <UploadZone onUploaded={fetchDocs} />
        <TextInputZone onAdded={fetchDocs} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3.5 rounded-xl flex items-center justify-between gap-3 animate-fade-in">
          <span className="flex items-center gap-2"><AlertCircle size={16} className="shrink-0" /> {error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600" title="Fechar"><X size={16} /></button>
        </div>
      )}

      {/* Documents uploaded by admin (non-seed) */}
      <DocumentList
        docs={uploadedDocs}
        loading={loading}
        onRefresh={fetchDocs}
        onDelete={setDeleteTarget}
        onRetry={handleRetry}
        onDownload={handleDownload}
        onToggleActive={handleToggleActive}
        onPreview={doc => setPreviewDoc(doc)}
      />

      {/* Fixed collections — TR (all) + outros seeds */}
      <FixedCollections
        trDocs={trDocs}
        otherFixedDocs={otherFixedDocs}
        onDelete={setDeleteTarget}
        onPreview={doc => setPreviewDoc(doc)}
        onUploaded={fetchDocs}
      />

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
