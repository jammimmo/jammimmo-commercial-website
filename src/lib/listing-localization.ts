/** Public narrative only. Structured prices, contact details and property facts
 * never pass through this contract. No provider, SDK, environment or DOM reads. */
export const LISTING_TRANSLATION_LOCALES = ['en', 'wo', 'es', 'it', 'ar'] as const;
export type ListingTranslationLocale = typeof LISTING_TRANSLATION_LOCALES[number];
export interface ListingText { title: string; commercial_message: string; description: string }
export type ListingTranslationMap = Partial<Record<ListingTranslationLocale, ListingText>>;
export interface ListingTranslationCacheFile {
  version: 1;
  entries: Record<string, { source: ListingText; sourceHash: string; translations: ListingTranslationMap }>;
}
/** UTF-16 lengths, matching the existing public text boundaries. Never truncate
 * or trim before hashing: a changed character is a different source. */
export const LISTING_TEXT_LIMITS = { title: 300, commercial_message: 1000, description: 10000 } as const;
const TEXT_KEYS = ['title', 'commercial_message', 'description'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function own(value: Record<string, unknown>, key: string): unknown {
  const field = Object.getOwnPropertyDescriptor(value, key);
  return field?.enumerable && 'value' in field ? field.value : undefined;
}
function readListingText(input: unknown, bounded: boolean): ListingText {
  if (!record(input)) throw new Error('Invalid public listing text');
  const output: ListingText = { title: '', commercial_message: '', description: '' };
  for (const key of TEXT_KEYS) {
    const value = own(input, key);
    if (typeof value !== 'string' || (bounded && value.length > LISTING_TEXT_LIMITS[key])
      || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) throw new Error('Invalid public listing text');
    output[key] = value;
  }
  return output;
}
export function normalizeListingText(input: unknown): ListingText { return readListingText(input, true); }
export async function hashListingText(source: ListingText): Promise<string> {
  // normalizeListingText creates the canonical, fixed three-key order.
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeListingText(source)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function translationFor(source: ListingText, candidate: unknown): ListingText | null {
  try {
    const translated = normalizeListingText(candidate);
    // An empty source field must remain empty; nonempty source text cannot be
    // silently dropped by a partial/failed provider response.
    if (TEXT_KEYS.some(key => (source[key].trim().length === 0) !== (translated[key].trim().length === 0))) return null;
    return translated;
  } catch { return null; }
}
export function selectCachedTranslations(reference: string, source: ListingText, cache: unknown): ListingTranslationMap {
  try {
    const current = normalizeListingText(source);
    if (!record(cache) || own(cache, 'version') !== 1) return {};
    const entries = own(cache, 'entries');
    if (!record(entries)) return {};
    const entry = own(entries, reference);
    if (!record(entry)) return {};
    const sourceHash = own(entry, 'sourceHash');
    if (typeof sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(sourceHash)) return {};
    const boundSource = normalizeListingText(own(entry, 'source'));
    if (TEXT_KEYS.some(key => boundSource[key] !== current[key])) return {};
    const translations = own(entry, 'translations');
    if (!record(translations)) return {};
    const selected: ListingTranslationMap = {};
    for (const locale of LISTING_TRANSLATION_LOCALES) {
      const translated = translationFor(current, own(translations, locale));
      if (translated) selected[locale] = translated;
    }
    return selected;
  } catch { return {}; }
}
export function resolveListingText(property: ListingText & { translations?: ListingTranslationMap },
  lang: 'fr' | ListingTranslationLocale): ListingText & { translated: boolean } {
  const source = readListingText(property, false);
  // A historical French description exceeding provider limits must not break
  // its page or be truncated. It simply has no usable translation overlay.
  if (TEXT_KEYS.some(key => source[key].length > LISTING_TEXT_LIMITS[key])) return { ...source, translated: false };
  if (lang !== 'fr' && LISTING_TRANSLATION_LOCALES.some(locale => locale === lang) && record(property.translations)) {
    const translated = translationFor(source, own(property.translations, lang));
    if (translated) return { ...translated, translated: TEXT_KEYS.some(key => source[key].trim().length > 0) };
  }
  return { ...source, translated: false };
}

/** Copy for catalogue islands without an original/translation toggle. Keep
 * only the active narrative, not five full descriptions per card. */
export function listingDisplayView<T extends ListingText & { translations?: ListingTranslationMap }>(
  property: T, lang: 'fr' | ListingTranslationLocale): Omit<T, 'translations'> {
  const text = resolveListingText(property, lang);
  const view = { ...property, title: text.title, commercial_message: text.commercial_message, description: text.description };
  Reflect.deleteProperty(view, 'translations');
  return view;
}
