import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength)}...`
}

export function getConformidadeColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export function getConformidadeBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100'
  if (score >= 60) return 'bg-yellow-100'
  return 'bg-red-100'
}

export function getConformidadeLabel(score: number): string {
  if (score >= 80) return 'Alta Conformidade'
  if (score >= 60) return 'Conformidade Moderada'
  return 'Baixa Conformidade'
}

export function getSeveridadeColor(severidade: string): string {
  const colors: Record<string, string> = {
    critica: 'bg-red-100 text-red-800 border-red-200',
    alta: 'bg-orange-100 text-orange-800 border-orange-200',
    media: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    baixa: 'bg-blue-100 text-blue-800 border-blue-200',
  }
  return colors[severidade] || 'bg-gray-100 text-gray-800 border-gray-200'
}

export function getPrioridadeColor(prioridade: string): string {
  const colors: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-yellow-100 text-yellow-700',
    baixa: 'bg-green-100 text-green-700',
  }
  return colors[prioridade] || 'bg-gray-100 text-gray-700'
}
