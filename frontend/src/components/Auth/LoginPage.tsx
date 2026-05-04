import type { FormEvent } from 'react';
import { Lock, User } from 'lucide-react';
import { COLORS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import FaixaCores from '../Layout/FaixaCores';

export default function LoginPage() {
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const matricula = formData.get('matricula') as string;
    const senha = formData.get('senha') as string;
    await login(matricula, senha);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ backgroundColor: COLORS.primary }} className="shadow-lg">
        <div className="max-w-5xl mx-auto py-5 px-6 flex flex-col items-center gap-2">
          <img
            src="/logo-fsph.png"
            alt="Logo FSPH – Governo de Sergipe"
            className="h-20 object-contain drop-shadow-md"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.style.display = 'none';
              (target.nextSibling as HTMLElement).style.display = 'flex';
            }}
          />
          <div className="hidden items-center gap-3">
            <div className="bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm border border-white/20">
              <span className="font-black text-white text-2xl tracking-widest">FSPH</span>
            </div>
            <div className="text-white">
              <p className="font-bold text-lg leading-tight">Sistema de Gestão COLIC</p>
              <p className="text-blue-200 text-xs">Fundação de Saúde Parreiras Horta</p>
            </div>
          </div>
        </div>
        <FaixaCores />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Coordenação de Licitações e Contratos</h1>
            <p className="text-slate-500 text-sm mt-1">Lei 14.133/2021 • Decreto Estadual nº 342/2023 • SEI</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5 text-center">Acesso ao Sistema</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                  Usuário / Matrícula
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    name="matricula"
                    required
                    autoFocus
                    placeholder="Digite seu usuário"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="password"
                    name="senha"
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: COLORS.primary }}
                className="w-full py-2.5 text-white rounded-lg font-bold text-sm hover:bg-[#134084] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-md mt-2"
              >
                {loading ? 'Entrando...' : 'Acessar o Sistema'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
