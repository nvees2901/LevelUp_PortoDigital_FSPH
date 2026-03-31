import React from 'react';
import { COLORS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import FaixaCores from './FaixaCores';

export default function Header() {
  const { usuario } = useAuth();

  if (!usuario) return null;

  return (
    <header className="w-full flex flex-col z-20 shadow-md relative">
      <div style={{ backgroundColor: COLORS.primary }} className="text-white py-3 px-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 bg-white p-1 rounded object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = 'https://via.placeholder.com/150x40?text=Logo+Aqui';
            }}
          />
          <div className="hidden md:block border-l border-blue-800 pl-4">
            <h1 className="font-bold text-lg leading-tight tracking-wide">Plataforma TR</h1>
            <span className="text-xs text-blue-200">Fundação de Saúde Parreiras Horta</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold">{usuario.nome}</p>
            <p className="text-xs text-blue-200 uppercase">Matrícula: {usuario.nomeUsuarioLogado}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-white text-[#0a2f64] flex items-center justify-center font-bold shadow-sm">
            {React.createElement(usuario.icon, { size: 20 })}
          </div>
        </div>
      </div>
      <FaixaCores />
    </header>
  );
}
