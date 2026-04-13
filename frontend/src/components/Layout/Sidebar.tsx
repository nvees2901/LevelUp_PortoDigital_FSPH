import { PieChart, FileText, MessageSquare, Upload, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import MenuButton from './MenuButton';
import type { TelaId } from '../../types';

interface SidebarProps {
  telaAtual: TelaId;
  navegar: (tela: TelaId) => void;
}

export default function Sidebar({ telaAtual, navegar }: SidebarProps) {
  const { usuario, logout } = useAuth();

  if (!usuario) return null;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto mt-2">
        <p className="text-xs uppercase text-slate-400 font-bold mb-3 px-2 tracking-wider">Menu Principal</p>
        <MenuButton icone={PieChart} texto="Dashboard" ativo={telaAtual === 'dashboard'} onClick={() => navegar('dashboard')} />
        <MenuButton icone={FileText} texto="Base de Termos" ativo={telaAtual === 'lista'} onClick={() => navegar('lista')} />

        {(usuario.id === 'demandante' || usuario.id === 'contratos') && (
          <>
            <div className="pt-6 pb-2">
              <p className="text-xs uppercase text-slate-400 font-bold px-2 tracking-wider">Inteligência Artificial</p>
            </div>
            <MenuButton icone={MessageSquare} texto="Gerar via Chat IA" ativo={telaAtual === 'chat'} onClick={() => navegar('chat')} />
            <MenuButton icone={Upload} texto="Analisar Documento" ativo={telaAtual === 'analise'} onClick={() => navegar('analise')} />
          </>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-red-600 hover:text-red-800 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors font-medium"
        >
          <LogOut size={18} />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
}
