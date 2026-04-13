import { PieChart, FileText, Archive, Bot, Upload, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { TelaId } from '../../types';

interface SidebarProps {
  telaAtual: TelaId;
  navegar: (tela: TelaId) => void;
}

export default function Sidebar({ telaAtual, navegar }: SidebarProps) {
  const { usuario, logout } = useAuth();
  if (!usuario) return null;

  const btn = (id: TelaId, label: string, Icon: typeof PieChart) => (
    <button key={id} onClick={() => navegar(id)}
      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
        telaAtual === id ? 'bg-[#0a2f64] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'
      }`}>
      <Icon size={17} />{label}
    </button>
  );

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto mt-3">
        <p className="text-xs uppercase text-slate-400 font-bold mb-2 px-2 tracking-wider">Menu</p>
        {btn('dashboard', 'Dashboard', PieChart)}
        {btn('lista', 'Processos', FileText)}
        {btn('base', 'Base de Termos', Archive)}
        <div className="pt-4 pb-1">
          <p className="text-xs uppercase text-slate-400 font-bold px-2 tracking-wider">Assistente IA</p>
        </div>
        {btn('chat', 'Chat IA / Consulta', Bot)}
        {btn('anexar', 'Anexar Documento', Upload)}
        <div className="px-3 py-2 mt-1">
          <p className="text-xs text-slate-400 leading-relaxed">
            {usuario.id === 'demandante'
              ? 'Elabore processos e analise documentos com IA.'
              : 'Consulte fluxos, legislação e analise documentos.'}
          </p>
        </div>
      </nav>
      <div className="p-3 border-t border-slate-200">
        <button onClick={logout}
          className="flex items-center gap-2 text-red-500 hover:bg-red-50 w-full p-2.5 rounded-lg transition-colors text-sm font-medium">
          <LogOut size={16} /> Sair do Sistema
        </button>
        <div className="mx-2 mt-2 px-2 py-1 rounded text-xs text-center font-semibold bg-amber-50 text-amber-700">
          Modo demonstração
        </div>
      </div>
    </aside>
  );
}
