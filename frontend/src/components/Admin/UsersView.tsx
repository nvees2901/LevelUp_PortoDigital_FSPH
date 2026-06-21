import { useState, useCallback, useEffect } from 'react';
import { Users, Plus, Pencil, UserX, UserCheck } from 'lucide-react';
import type { UserOut, UserCreate, UserUpdate, TelaId } from '../../types';
import { listUsers, createUser, updateUser, deactivateUser } from '../../services/api';
import { SETORES, SUBUNIDADES } from '../../constants';

// Props
interface UsersViewProps {
  navegar: (tela: TelaId, termoId?: string) => void;
}

// Helper: setor label
const setorLabel = (id: string) => SETORES.find(s => s.id === id)?.nome ?? id;

// ─── Modal de Criação/Edição ──────────────────────────────────────────────────

interface UserModalProps {
  editTarget: UserOut | null; // null = criar, not-null = editar
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ editTarget, onClose, onSaved }: UserModalProps) {
  const isEdit = editTarget !== null;

  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState(editTarget?.nome ?? '');
  const [setorId, setSetorId] = useState(editTarget?.setor_id ?? SETORES[0].id);
  const [subunidade, setSubunidade] = useState<string>(editTarget?.subunidade ?? '');
  const [isAdmin, setIsAdmin] = useState(editTarget?.is_admin ?? false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (isEdit) {
        const data: UserUpdate = {
          nome: nome.trim() || undefined,
          setor_id: setorId,
          subunidade: subunidade || null,
          is_admin: isAdmin,
        };
        await updateUser(editTarget.id, data);
      } else {
        const data: UserCreate = {
          matricula: matricula.trim(),
          senha,
          nome: nome.trim(),
          setor_id: setorId,
          subunidade: subunidade || null,
          is_admin: isAdmin,
        };
        await createUser(data);
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar usuário');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
          <Users size={20} className="text-brand-primary" />
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Matrícula — só em criação */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Matrícula <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={matricula}
                onChange={e => setMatricula(e.target.value)}
                required
                disabled={submitting}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
                placeholder="Ex: 12345"
              />
            </div>
          )}

          {/* Senha — só em criação */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                disabled={submitting}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
                placeholder="Mínimo 4 caracteres"
              />
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
              disabled={submitting}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
              placeholder="Nome completo"
            />
          </div>

          {/* Setor */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Setor <span className="text-red-500">*</span>
            </label>
            <select
              value={setorId}
              onChange={e => setSetorId(e.target.value as typeof setorId)}
              required
              disabled={submitting}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
            >
              {SETORES.map(s => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>

          {/* Subunidade */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subunidade
            </label>
            <select
              value={subunidade}
              onChange={e => setSubunidade(e.target.value)}
              disabled={submitting}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary transition-colors disabled:opacity-50"
            >
              <option value="">Nenhuma</option>
              {SUBUNIDADES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* É administrador */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_admin"
              checked={isAdmin}
              onChange={e => setIsAdmin(e.target.checked)}
              disabled={submitting}
              className="w-4 h-4 accent-brand-primary"
            />
            <label htmlFor="is_admin" className="text-sm font-medium text-slate-700">
              É administrador
            </label>
          </div>

          {/* Error message */}
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function UsersView({ navegar: _navegar }: UsersViewProps) {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<UserOut | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listUsers();
      setUsers(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleOpenCreate = () => {
    setEditTarget(null);
    setShowModal(true);
  };

  const handleOpenEdit = (user: UserOut) => {
    setEditTarget(user);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditTarget(null);
  };

  const handleToggleAtivo = async (user: UserOut) => {
    setTogglingId(user.id);
    try {
      if (user.ativo) {
        await deactivateUser(user.id);
      } else {
        await updateUser(user.id, { ativo: true });
      }
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do usuário');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-brand-primary" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Gestão de Usuários</h1>
            <p className="text-sm text-slate-500">Gerencie os usuários do sistema</p>
          </div>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-hover transition-colors shadow-sm"
        >
          <Plus size={16} /> Novo Usuário
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
          <p className="text-slate-400 text-sm">Carregando usuários...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {users.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Nenhum usuário encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Matrícula</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Setor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-700">{user.matricula}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{user.nome}</td>
                    <td className="px-4 py-3 text-slate-600">{setorLabel(user.setor_id)}</td>
                    <td className="px-4 py-3">
                      {user.is_admin && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Admin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.ativo ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Ativo
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          title="Editar usuário"
                          className="p-1.5 text-slate-500 hover:text-brand-primary hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleAtivo(user)}
                          disabled={togglingId === user.id}
                          title={user.ativo ? 'Desativar usuário' : 'Reativar usuário'}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            user.ativo
                              ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {user.ativo ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <UserModal
          editTarget={editTarget}
          onClose={handleCloseModal}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
}
