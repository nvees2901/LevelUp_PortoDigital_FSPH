import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FLUXO, DADOS_INICIAIS } from './constants';
import LoginPage from './components/Auth/LoginPage';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import DashboardView from './components/Dashboard/DashboardView';
import TermList from './components/Terms/TermList';
import TermDetail from './components/Terms/TermDetail';
import ChatView from './components/Chat/ChatView';
import UploadView from './components/Upload/UploadView';
import type { TermoMock, TelaId } from './types';

function AppContent() {
  const { usuario } = useAuth();
  const [termos, setTermos] = useState<TermoMock[]>(DADOS_INICIAIS);
  const [telaAtual, setTelaAtual] = useState<TelaId>('dashboard');
  const [termoSelecionado, setTermoSelecionado] = useState<TermoMock | null>(null);

  const navegar = useCallback((tela: TelaId, termo?: TermoMock) => {
    setTelaAtual(tela);
    if (termo) setTermoSelecionado(termo);
  }, []);

  const avancarFluxo = useCallback((termoId: string) => {
    setTermos((prev) =>
      prev.map((t) => {
        if (t.id === termoId) {
          const confAtual = FLUXO[t.status];
          if (confAtual?.proximo) {
            return { ...t, status: confAtual.proximo };
          }
        }
        return t;
      })
    );
    navegar('lista');
  }, [navegar]);

  if (!usuario) {
    return <LoginPage />;
  }

  const renderConteudoPrincipal = () => {
    switch (telaAtual) {
      case 'dashboard':
        return <DashboardView termos={termos} navegar={navegar} />;
      case 'lista':
        return <TermList termos={termos} navegar={navegar} />;
      case 'detalhe':
        return <TermDetail termo={termoSelecionado} avancarFluxo={avancarFluxo} navegar={navegar} />;
      case 'chat':
        return <ChatView navegar={navegar} setTermos={setTermos} termos={termos} />;
      case 'analise':
        return <UploadView navegar={navegar} />;
      default:
        return <DashboardView termos={termos} navegar={navegar} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar telaAtual={telaAtual} navegar={navegar} />
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100/50">
          <div className="flex-1 overflow-auto p-6 relative">
            {renderConteudoPrincipal()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
