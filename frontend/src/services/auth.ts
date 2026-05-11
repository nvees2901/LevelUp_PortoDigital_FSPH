import type { LoginResponse, UserOut } from '../types';
import { ApiError } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export async function loginRequest(matricula: string, senha: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, senha }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro de rede' }));
    throw new ApiError(response.status, error.message || `Erro ${response.status}`, error.detail);
  }

  return response.json();
}

export async function getMe(token: string): Promise<UserOut> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Token inválido' }));
    throw new ApiError(response.status, error.message || `Erro ${response.status}`, error.detail);
  }

  return response.json();
}
