import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { UsuarioAtual, Setor } from '../types';
import { SETORES } from '../constants';

interface AuthContextType {
  usuario: UsuarioAtual | null;
  login: (setor: Setor, nomeUsuario: string) => void;
  logout: () => void;
}

const AUTH_KEY = 'fsph_auth';

function loadAuth(): UsuarioAtual | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reconstruct icon from SETORES (icons can't be serialized)
    const setor = SETORES.find((s) => s.id === parsed.id);
    if (!setor) return null;
    return { ...parsed, icon: setor.icon };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(loadAuth);

  const login = useCallback((setor: Setor, nomeUsuario: string) => {
    const user: UsuarioAtual = {
      ...setor,
      nomeUsuarioLogado: nomeUsuario || 'Usuário Padrão',
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    setUsuario(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
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
