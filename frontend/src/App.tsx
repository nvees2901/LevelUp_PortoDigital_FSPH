import { Component, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/Auth/LoginPage';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import DashboardView from './components/Dashboard/DashboardView';
import TermList from './components/Terms/TermList';
import TermDetail from './components/Terms/TermDetail';
import ChatView from './components/Chat/ChatView';
import UploadView from './components/Upload/UploadView';
import ContextDocumentsView from './components/Admin/ContextDocumentsView';
import type { TermoMock, TelaId } from './types';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Erro na aplicacao</h1>
            <p className="text-slate-600 mb-4">{this.state.error.message}</p>
            <pre className="bg-slate-100 p-4 rounded text-xs overflow-auto max-h-40 mb-4">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="px-4 py-2 bg-[#0a2f64] text-white rounded-lg hover:bg-[#134084]"
            >
              Limpar dados e recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { usuario } = useAuth();
  const [telaAtual, setTelaAtual] = useState<TelaId>('dashboard');
  const [termoSelecionado, setTermoSelecionado] = useState<TermoMock | null>(null);

  const navegar = useCallback((tela: TelaId, termo?: TermoMock) => {
    setTelaAtual(tela);
    if (termo) setTermoSelecionado(termo);
  }, []);

  if (!usuario) {
    return <LoginPage />;
  }

  const renderConteudoPrincipal = () => {
    switch (telaAtual) {
      case 'dashboard':
        return <DashboardView navegar={navegar} />;
      case 'lista':
        return <TermList navegar={navegar} />;
      case 'detalhe':
        return <TermDetail termo={termoSelecionado} navegar={navegar} />;
      case 'chat':
        return <ChatView navegar={navegar} />;
      case 'analise':
        return <UploadView navegar={navegar} />;
      case 'base':
        return <TermList navegar={navegar} />;
      case 'admin':
        return usuario.is_admin
          ? <ContextDocumentsView navegar={navegar} />
          : <DashboardView navegar={navegar} />;
      default:
        return <DashboardView navegar={navegar} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar telaAtual={telaAtual} navegar={navegar} />
        <main className="flex-1 overflow-auto p-5 bg-slate-100/60">
          {renderConteudoPrincipal()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
