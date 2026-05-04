import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { UsuarioAtual, UserOut } from '../types';
import { SETORES } from '../constants';
import { loginRequest, getMe } from '../services/auth';
import { ApiError } from '../services/api';

interface AuthContextType {
  usuario: UsuarioAtual | null;
  loading: boolean;
  error: string | null;
  login: (matricula: string, senha: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = 'fsph_token';
const USER_KEY = 'fsph_user';

function deriveUsuario(userOut: UserOut): UsuarioAtual | null {
  const setor = SETORES.find((s) => s.id === userOut.setor_id);
  if (!setor) return null;
  return {
    id: userOut.setor_id,
    nome: setor.nome,
    icon: setor.icon,
    descricao: setor.descricao,
    nomeUsuarioLogado: userOut.nome,
    subunidade: userOut.subunidade ?? undefined,
  };
}

function loadCachedUser(): UsuarioAtual | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const userOut: UserOut = JSON.parse(raw);
    return deriveUsuario(userOut);
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(loadCachedUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valida o token em background ao montar — faz logout silencioso se expirado
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUsuario(null);
      localStorage.removeItem(USER_KEY);
      return;
    }
    getMe(token).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUsuario(null);
    });
  }, []);

  const login = useCallback(async (matricula: string, senha: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await loginRequest(matricula, senha);
      localStorage.setItem(TOKEN_KEY, response.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      const derived = deriveUsuario(response.user);
      if (derived) setUsuario(derived);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao conectar com o servidor. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUsuario(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, loading, error, login, logout }}>
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
