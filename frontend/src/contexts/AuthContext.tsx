import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { UsuarioAtual, Setor } from '../types';

interface AuthContextType {
  usuario: UsuarioAtual | null;
  login: (setor: Setor, nomeUsuario: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(null);

  const login = useCallback((setor: Setor, nomeUsuario: string) => {
    setUsuario({
      ...setor,
      nomeUsuarioLogado: nomeUsuario || 'Usuário Padrão',
    });
  }, []);

  const logout = useCallback(() => {
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
