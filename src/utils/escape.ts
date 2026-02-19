/**
 * Zentrale escapeHtml-Funktion.
 * Sicher für HTML-Content UND Attribut-Kontexte.
 */
export function escapeHtml(text: any): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Alias für Attribut-Kontexte */
export const escapeAttr = escapeHtml;
