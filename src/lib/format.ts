/**
 * Sénégalais number formatting helpers.
 * Sourced from admin: PropertyForm.tsx ~ formatFCFA().
 */

/**
 * Group an integer with thin spaces every 3 digits — "110000" → "110 000".
 *
 * We do NOT use `Intl.NumberFormat('fr-FR')`: at BUILD time (Cloudflare Pages
 * Node) the fr-FR locale grouping silently no-ops on some runtimes, so prices
 * rendered server-side (fiche bien, PropertyCard) came out as "110000" while
 * client-rendered ones (MiniCard, browser ICU) showed "110 000" — an embarrassing
 * inconsistency on the detail page. Manual grouping is deterministic everywhere.
 * Uses a regular space (renders identically, stays predictable in tests).
 */
function groupFr(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatFCFA(n: number | null | undefined, opts: { suffix?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const suffix = opts.suffix !== false ? ' FCFA' : '';
  return `${groupFr(n)}${suffix}`;
}

/** "850 000 FCFA / mois" for rentals */
export function formatRentalPrice(price: number, transactionType: string): string {
  return transactionType === 'Location'
    ? `${formatFCFA(price)} / mois`
    : formatFCFA(price);
}

/**
 * Localized SEO `<title>` for a property detail page.
 * FR / EN / WO surface unit + " — " price-as-headline + brand suffix.
 * Used by all three `[ref].astro` files.
 */
export function propertySeoTitle(
  p: { type: string; surface: number; quartier: string; city: string; price: number; transaction_type: string },
  lang: 'fr' | 'en' | 'wo',
): string {
  const unit = lang === 'en' ? 'sqm' : 'm²';
  const surfaceFrag = p.surface > 0 ? `${p.surface}${unit} ` : '';
  const price = formatRentalPrice(p.price, p.transaction_type);
  const sep = lang === 'en' ? ' — ' : ' — ';
  return `${p.type} ${surfaceFrag}${p.quartier} ${p.city}${sep}${price} | Jamm Immobilier`;
}

/**
 * Sanitise a free-text field (commercial_message / description) for use
 * inside `<meta name="description">` and Open Graph descriptions:
 *   - strip emojis and other display-only symbols
 *   - collapse all whitespace (including newlines) to single spaces
 *   - trim
 *   - cut to ≤160 chars at the last whole word
 *
 * SERP snippets typically render 150–160 chars on mobile and 920 px on
 * desktop — 160 is the safe cap. Raw `description.slice(0, 160)` was
 * leaking `\n` and emojis verbatim into the meta tag.
 */
export function metaDescription(...sources: Array<string | null | undefined>): string {
  const raw = sources.find((s) => s && s.trim().length > 0) ?? '';
  const stripped = raw
    // Remove most pictographic emoji ranges + variation selectors + zero-width joiners.
    // U+1F300..U+1FAFF (symbols/pictographs), U+2600..U+27BF (misc symbols + dingbats),
    // U+FE0F (VS-16), U+200D (ZWJ).
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= 160) return stripped;
  // Cut at the last space ≤160 to avoid splitting a word
  const cut = stripped.slice(0, 160);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/** "5 ch.", or "Studio" if 0 */
export function formatBedrooms(n: number): string {
  if (!n || n <= 0) return 'Studio';
  return `${n} ch.`;
}

/** "420 m²" */
export function formatSurface(n: number): string {
  if (!n || n <= 0) return '—';
  return `${groupFr(n)} m²`;
}

/** "Dakar · Almadies" */
export function formatLocation(city: string, quartier: string): string {
  return [city, quartier].filter(Boolean).join(' · ');
}
