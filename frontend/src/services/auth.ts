import type { LoginResponse, UserOut } from '../types';
import { request } from './api';

export async function loginRequest(matricula: string, senha: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ matricula, senha }),
  });
}

export async function getMe(): Promise<UserOut> {
  return request<UserOut>('/auth/me');
}
