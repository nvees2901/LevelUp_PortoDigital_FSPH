/**
 * Escapes special HTML characters to prevent XSS when inserting text into HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts a plain-text string (with optional **bold** markdown) to an HTML string.
 * HTML-escapes the text first to prevent XSS, then applies bold rendering.
 * Returns an HTML string safe for use with dangerouslySetInnerHTML.
 */
export function renderTexto(text: string): string {
  return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}
