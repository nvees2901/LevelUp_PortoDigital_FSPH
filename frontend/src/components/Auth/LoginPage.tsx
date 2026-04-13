import React, { useState } from 'react';
import { ArrowLeft, Lock, User } from 'lucide-react';
import { COLORS, SETORES } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import FaixaCores from '../Layout/FaixaCores';
import type { Setor } from '../../types';

export default function LoginPage() {
  const { login } = useAuth();
  const [setorSelecionado, setSetorSelecionado] = useState<Setor | null>(null);

  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!setorSelecionado) return;
    const formData = new FormData(e.currentTarget);
    const matricula = formData.get('matricula') as string;
    login(setorSelecionado, matricula);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      <div className="w-full shadow-sm" style={{ backgroundColor: COLORS.primary }}>
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-center items-center">
          <img
            src="/logo-fsph.png"
            alt="Logo FSPH e Governo de Sergipe"
            className="h-20 object-contain drop-shadow-md"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = 'https://via.placeholder.com/400x100?text=LOGO+FSPH+-+Governo+de+Sergipe';
            }}
          />
        </div>
        <FaixaCores />
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-4 w-full">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#0a2f64] mb-2">Sistema Inteligente de TRs</h1>
            <p className="text-slate-600">Gestão de Termos de Referência (Lei 14.133/2021)</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-xl border border-slate-100 relative overflow-hidden">
            {!setorSelecionado ? (
              <>
                <h2 className="text-2xl font-semibold mb-6 text-center text-slate-700">Selecione o seu Setor</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {SETORES.map((setor) => (
                    <button
                      key={setor.id}
                      onClick={() => setSetorSelecionado(setor)}
                      className="bg-white border-2 border-slate-200 hover:border-[#0a2f64] text-slate-700 hover:text-[#0a2f64] transition-all p-6 rounded-lg flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md"
                    >
                      <setor.icon size={40} className="text-[#0a2f64] opacity-80" />
                      <span className="font-medium text-lg text-center">{setor.nome}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                <button
                  onClick={() => setSetorSelecionado(null)}
                  className="flex items-center gap-2 text-slate-500 hover:text-[#0a2f64] mb-6 text-sm font-medium transition-colors"
                >
                  <ArrowLeft size={16} /> Voltar para seleção de setores
                </button>

                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                    {React.createElement(setorSelecionado.icon, { size: 32, className: 'text-[#0a2f64]' })}
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-800">{setorSelecionado.nome}</h2>
                  <p className="text-slate-500 text-sm mt-1">Insira suas credenciais para acessar</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nº de Usuário / Matrícula</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input
                        type="text"
                        name="matricula"
                        required
                        placeholder="Digite seu usuário"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] focus:border-[#0a2f64] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input
                        type="password"
                        name="senha"
                        required
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2f64] focus:border-[#0a2f64] transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    style={{ backgroundColor: COLORS.primary }}
                    className="w-full py-3 mt-4 text-white rounded-lg font-medium shadow-md hover:bg-[#134084] transition-colors"
                  >
                    Entrar no Sistema
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
