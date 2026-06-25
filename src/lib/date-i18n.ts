import type { Lang } from './i18n';

/**
 * Localized month names per language — manual, deterministic (no Intl/Date
 * locale-data, which the CF Pages build Node silently no-ops; same trap as the
 * number grouping in format.ts). Wolof code-switches to French month names.
 */
const MONTHS: Record<Lang, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  wo: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

/** "24 juin 2026" / "24 June 2026" / "24 يونيو 2026" from an ISO "YYYY-MM-DD". */
export function formatGuideDate(iso: string, lang: Lang): string {
  const [y, m, dd] = iso.split('-').map(Number);
  const months = MONTHS[lang] ?? MONTHS.fr;
  return `${dd} ${months[(m ?? 1) - 1]} ${y}`;
}
