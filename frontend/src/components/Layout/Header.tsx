import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import FaixaCores from './FaixaCores';

export default function Header() {
  const { usuario } = useAuth();
  if (!usuario) return null;

  return (
    <header className="z-20 shadow-md flex flex-col">
      <div className="bg-brand-primary py-2.5 px-5 flex justify-between items-center text-white">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo FSPH"
            className="h-10 bg-white p-1 rounded object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.style.display = 'none';
              (target.nextSibling as HTMLElement).style.display = 'flex';
            }}
          />
          <div className="hidden items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <span className="font-black text-lg tracking-widest">FSPH</span>
          </div>
          <div className="hidden md:block border-l border-blue-800 pl-3">
            <p className="font-bold text-sm leading-tight">Sistema COLIC</p>
            <p className="text-xs text-blue-300">Coordenação de Licitações e Contratos</p>
          </div>
        </div>
        {/* Perfil do usuário logado */}
        <div className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-lg pl-3 pr-2 py-1.5">
          <div className="text-right hidden sm:block leading-tight">
            <p className="font-bold text-sm">{usuario.nomeUsuarioLogado}</p>
            <p className="text-xs text-blue-200">
              {usuario.nome}
              {usuario.subunidade ? ` – ${usuario.subunidade.split('–')[0].trim()}` : ''}
              {usuario.matricula ? ` · Mat. ${usuario.matricula}` : ''}
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/30 shrink-0">
            {React.createElement(usuario.icon, { size: 17, className: 'text-white' })}
          </div>
        </div>
      </div>
      <FaixaCores />
    </header>
  );
}
