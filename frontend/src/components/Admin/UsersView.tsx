import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Pencil, UserX, UserCheck, X, Loader2 } from 'lucide-react';
import { SETORES, SUBUNIDADES } from '../../constants';
import { listUsers, createUser, updateUser, deleteUser, deleteUserPermanently } from '../../services/api';
import type { UserAdminOut, UserCreate, UserUpdate, SetorId, TelaId } from '../../types';

interface UsersViewProps {
  navegar: (tela: TelaId) => void;
}

const SETOR_LABELS: Record<string, string> = Object.fromEntries(
  SETORES.map((s) => [s.id, s.nome])
);

function Badge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  );
}

interface ModalProps {
  user?: UserAdminOut | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function UserModal({ user, onClose, onSaved }: ModalProps) {
  const isEditing = !!user;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    matricula: user?.matricula ?? '',
    nome: user?.nome ?? '',
    senha: '',
    setor_id: (user?.setor_id ?? 'colic') as SetorId,
    subunidade: user?.subunidade ?? '',
    is_admin: user?.is_admin ?? false,
    ativo: user?.ativo ?? true,
  });

  const set = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isEditing && user) {
        const payload: UserUpdate = {
          nome: form.nome,
          setor_id: form.setor_id,
          subunidade: form.subunidade || null,
          is_admin: form.is_admin,
          ativo: form.ativo,
        };
        if (form.senha) payload.senha = form.senha;
        await updateUser(user.id, payload);
      } else {
        const payload: UserCreate = {
          matricula: form.matricula,
          nome: form.nome,
          senha: form.senha,
          setor_id: form.setor_id,
          subunidade: form.subunidade || null,
          is_admin: form.is_admin,
        };
        await createUser(payload);
      }
      await onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar usuário.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-slate-800">
            {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Matrícula
            </label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={form.matricula}
              onChange={(e) => set('matricula', e.target.value)}
              placeholder="Ex: COLIC-002"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Nome Completo
            </label>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => set('nome', e.target.value)}
              placeholder="Nome do funcionário"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Senha {isEditing && <span className="text-slate-400 font-normal normal-case">(deixe em branco para manter)</span>}
            </label>
            <input
              type="password"
              required={!isEditing}
              value={form.senha}
              onChange={(e) => set('senha', e.target.value)}
              placeholder={isEditing ? '••••••••' : 'Mínimo 6 caracteres'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Setor
            </label>
            <select
              value={form.setor_id}
              onChange={(e) => set('setor_id', e.target.value as SetorId)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              {SETORES.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>

          {form.setor_id === 'demandante' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Subunidade
              </label>
              <select
                value={form.subunidade}
                onChange={(e) => set('subunidade', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Selecione...</option>
                {SUBUNIDADES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_admin}
                onChange={(e) => set('is_admin', e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Administrador</span>
            </label>
            {isEditing && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => set('ativo', e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Usuário ativo</span>
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-primary flex-1 px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>

          {isEditing && (
            <div className="pt-3 border-t border-slate-100 mt-1">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full px-4 py-2 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50 transition-colors"
                >
                  Excluir usuário permanentemente
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 text-center font-medium">
                    Tem certeza? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={async () => {
                        if (!user) return;
                        setDeleting(true);
                        try {
                          await deleteUserPermanently(user.id);
                          await onSaved();
                          onClose();
                        } catch {
                          setError('Erro ao excluir usuário.');
                          setDeleting(false);
                          setConfirmDelete(false);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {deleting && <Loader2 size={13} className="animate-spin" />}
                      Sim, excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function UsersView({ navegar: _navegar }: UsersViewProps) {
  const [users, setUsers] = useState<UserAdminOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<UserAdminOut | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleToggleAtivo(user: UserAdminOut) {
    setActionLoading(user.id);
    try {
      if (user.ativo) {
        await deleteUser(user.id);
      } else {
        await updateUser(user.id, { ativo: true });
      }
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Gerenciamento de Usuários</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        <button
          onClick={() => { setSelected(null); setModal('create'); }}
          className="bg-brand-primary hover:bg-brand-hover flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-semibold shadow-sm"
        >
          <UserPlus size={16} />
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Matrícula</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Setor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Perfil</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.ativo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono font-medium text-slate-700">{u.matricula}</td>
                  <td className="px-4 py-3 text-slate-700">{u.nome}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {SETOR_LABELS[u.setor_id] ?? u.setor_id}
                    {u.subunidade && <span className="block text-xs text-slate-400">{u.subunidade.split('–')[0].trim()}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_admin
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Admin</span>
                      : <span className="text-slate-400 text-xs">Usuário</span>
                    }
                  </td>
                  <td className="px-4 py-3"><Badge ativo={u.ativo} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setSelected(u); setModal('edit'); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleAtivo(u)}
                        disabled={actionLoading === u.id}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.ativo
                            ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={u.ativo ? 'Desativar' : 'Reativar'}
                      >
                        {actionLoading === u.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : u.ativo ? <UserX size={14} /> : <UserCheck size={14} />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nenhum usuário encontrado.
            </div>
          )}
        </div>
      )}

      {modal && (
        <UserModal
          user={modal === 'edit' ? selected : null}
          onClose={() => setModal(null)}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
}
