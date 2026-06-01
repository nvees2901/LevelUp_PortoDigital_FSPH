/**
 * Formats a numeric value as Brazilian Real currency.
 * Uses Intl.NumberFormat for correct locale-aware formatting.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Formats an ISO date string as a localized Brazilian date (dd/mm/yyyy).
 * Returns '—' for null/undefined input.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (dateStr == null) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

/**
 * Returns a Tailwind CSS text-color class based on a compliance score.
 * score >= 80 → green, score >= 50 → amber, else → red.
 */
export function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}
