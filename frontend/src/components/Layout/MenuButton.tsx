import type { LucideIcon } from 'lucide-react';

interface MenuButtonProps {
  icone: LucideIcon;
  texto: string;
  ativo: boolean;
  onClick: () => void;
}

export default function MenuButton({ icone: Icon, texto, ativo, onClick }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-3 rounded-lg transition-all font-medium ${
        ativo
          ? 'bg-[#0a2f64] text-white shadow-md'
          : 'text-slate-600 hover:bg-slate-100 hover:text-[#0a2f64]'
      }`}
    >
      <Icon size={20} />
      <span>{texto}</span>
    </button>
  );
}
