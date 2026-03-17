export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const API_V1 = `${API_BASE_URL}/api/v1`

export const ROUTES = {
  HOME: '/',
  CHAT: '/chat',
  TERMS: '/terms',
  TERMS_NEW: '/terms/new',
  TERM_DETAIL: (id: string) => `/terms/${id}`,
  ANALYSIS: '/analysis',
} as const

export const TERM_STATUS = {
  RASCUNHO: 'rascunho',
  EM_REVISAO: 'em_revisao',
  APROVADO: 'aprovado',
  PUBLICADO: 'publicado',
} as const

export const TERM_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em Revisão',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
}

export const TERM_STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-800',
  em_revisao: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-green-100 text-green-800',
  publicado: 'bg-blue-100 text-blue-800',
}

export const TERM_CATEGORIES = [
  'Serviços de TI',
  'Obras e Engenharia',
  'Material de Escritório',
  'Serviços de Limpeza',
  'Serviços de Segurança',
  'Equipamentos',
  'Consultoria',
  'Treinamento',
  'Transporte',
  'Comunicação',
  'Outros',
]

export const CONFORMIDADE_THRESHOLDS = {
  ALTA: 80,
  MEDIA: 60,
  BAIXA: 0,
}

export const QUERY_KEYS = {
  TERMS: 'terms',
  TERM: 'term',
  ANALYSES: 'analyses',
  ANALYSIS: 'analysis',
} as const
