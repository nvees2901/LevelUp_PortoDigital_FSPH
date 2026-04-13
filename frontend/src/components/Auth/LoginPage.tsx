import React, { useState } from 'react';
import { ArrowLeft, Lock, User } from 'lucide-react';
import { COLORS, SETORES, SUBUNIDADES } from '../../constants';
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
    const subunidade = formData.get('subunidade') as string | null;
    login(setorSelecionado, matricula, subunidade ?? undefined);
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
        <div className="w-full max-w-4xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Coordenação de Licitações e Contratos</h1>
            <p className="text-slate-500 text-sm mt-1">Lei 14.133/2021 • Decreto Estadual nº 342/2023 • SEI</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7">
            {!setorSelecionado ? (
              <>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 text-center">Selecione sua Unidade de Acesso</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {SETORES.map((s) => (
                    <button key={s.id} onClick={() => setSetorSelecionado(s)}
                      className="border-2 border-slate-200 hover:border-[#0a2f64] hover:bg-blue-50 rounded-xl p-5 flex flex-col items-center gap-2.5 transition-all group">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-[#0a2f64] flex items-center justify-center transition-colors">
                        {React.createElement(s.icon, { size: 24, className: 'text-[#0a2f64] group-hover:text-white transition-colors' })}
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-slate-800 text-sm">{s.nome}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.descricao}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="max-w-sm mx-auto">
                <button onClick={() => setSetorSelecionado(null)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-[#0a2f64] mb-6 text-sm transition-colors">
                  <ArrowLeft size={15} /> Voltar
                </button>
                <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="w-10 h-10 bg-[#0a2f64] rounded-lg flex items-center justify-center shrink-0">
                    {React.createElement(setorSelecionado.icon, { size: 20, className: 'text-white' })}
                  </div>
                  <div>
                    <p className="font-bold text-[#0a2f64] text-sm">{setorSelecionado.nome}</p>
                    <p className="text-xs text-slate-500">{setorSelecionado.descricao}</p>
                  </div>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {setorSelecionado.id === 'demandante' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Subunidade</label>
                      <select name="subunidade" required
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64] bg-white">
                        {SUBUNIDADES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Usuário / Matrícula</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 text-slate-400" size={16} />
                      <input type="text" name="matricula" required placeholder="Digite seu usuário"
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                      <input type="password" name="senha" required placeholder="••••••••"
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2f64]" />
                    </div>
                  </div>
                  <button type="submit" style={{ backgroundColor: COLORS.primary }}
                    className="w-full py-2.5 text-white rounded-lg font-bold text-sm hover:bg-[#134084] transition-colors shadow-md mt-2">
                    Acessar o Sistema
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
