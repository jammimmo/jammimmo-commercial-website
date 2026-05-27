/**
 * Sénégalais number formatting helpers.
 * Sourced from admin: PropertyForm.tsx ~ formatFCFA().
 */

const FCFA = new Intl.NumberFormat('fr-FR');

export function formatFCFA(n: number | null | undefined, opts: { suffix?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const suffix = opts.suffix !== false ? ' FCFA' : '';
  return `${FCFA.format(Math.round(n))}${suffix}`;
}

/** "850 000 FCFA / mois" for rentals */
export function formatRentalPrice(price: number, transactionType: string): string {
  return transactionType === 'Location'
    ? `${formatFCFA(price)} / mois`
    : formatFCFA(price);
}

/** "5 ch.", or "Studio" if 0 */
export function formatBedrooms(n: number): string {
  if (!n || n <= 0) return 'Studio';
  return `${n} ch.`;
}

/** "420 m²" */
export function formatSurface(n: number): string {
  if (!n || n <= 0) return '—';
  return `${FCFA.format(n)} m²`;
}

/** "Dakar · Almadies" */
export function formatLocation(city: string, quartier: string): string {
  return [city, quartier].filter(Boolean).join(' · ');
}
