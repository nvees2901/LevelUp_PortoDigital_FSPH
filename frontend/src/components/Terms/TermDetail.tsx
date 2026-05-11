import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { TelaId } from '../../types';

interface TermDetailProps {
  termId: string | null;
  navegar: (tela: TelaId, termoId?: string) => void;
}

export default function TermDetail({ termId, navegar }: TermDetailProps) {
  const { usuario } = useAuth();

  if (!termId || !usuario) return null;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button
        onClick={() => navegar('lista')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-[#0a2f64] mb-5 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={15} /> Voltar para Processos
      </button>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">
        Carregando...
      </div>
    </div>
  );
}
