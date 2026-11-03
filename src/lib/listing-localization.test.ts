import { describe, expect, it, vi } from 'vitest';
import { LISTING_TRANSLATION_LOCALES, hashListingText, normalizeListingText, resolveListingText, selectCachedTranslations, listingDisplayView,
  type ListingText, type ListingTranslationCacheFile } from './listing-localization';
import { serializeJsonLd } from './json-ld';

const reference = 'JI-RAP-DKR-2609-0015';
const source: ListingText = { title: 'Titre fictif', commercial_message: '', description: 'Description française fictive : 150 000 FCFA.' };
const translated: ListingText = { title: 'Fictional title', commercial_message: '', description: 'Fictional English description: 150 000 FCFA.' };
async function cache(): Promise<ListingTranslationCacheFile> {
  return { version: 1, entries: { [reference]: { source: { ...source }, sourceHash: await hashListingText(source), translations: { en: { ...translated } } } } };
}
describe('current-source listing localization', () => {
  it('hashes only the exact three public texts in canonical order, without altering source whitespace', async () => {
    const first = await hashListingText(source);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashListingText({ description: source.description, title: source.title, commercial_message: source.commercial_message })).toBe(first);
    expect(await hashListingText({ ...source, title: source.title + ' ' })).not.toBe(first);
    expect(normalizeListingText({ ...source, price: 250000, images: ['fictional.jpg'], updated_at: 'changed' })).toEqual(source);
    expect(await hashListingText(normalizeListingText({ ...source, price: 250000, images: [], updated_at: 'changed' }))).toBe(first);
  });
  it('rejects stale narratives but preserves cached translations through price, photo and timestamp changes', async () => {
    const stored = await cache();
    expect(selectCachedTranslations(reference, source, stored)).toEqual({ en: translated });
    const editedFacts = { ...source, price: 999999, images: ['new-photo.jpg'], updated_at: '2026-11-03T10:00:00Z' };
    expect(selectCachedTranslations(reference, editedFacts, stored)).toEqual({ en: translated });
    for (const change of [{ title: 'Nouveau titre' }, { commercial_message: 'Accroche modifiée' }, { description: 'Nouvelle description' }]) {
      expect(selectCachedTranslations(reference, { ...source, ...change }, stored)).toEqual({});
    }
    expect(selectCachedTranslations('another-reference', source, stored)).toEqual({});
  });
  it('selects all five real target languages while French always stays the original', async () => {
    const stored = await cache();
    for (const locale of LISTING_TRANSLATION_LOCALES) stored.entries[reference].translations[locale] = { ...translated, title: `Titre fictif ${locale}` };
    const property = { ...source, translations: selectCachedTranslations(reference, source, stored), price: 150000 };
    for (const locale of LISTING_TRANSLATION_LOCALES) expect(resolveListingText(property, locale)).toMatchObject({ title: `Titre fictif ${locale}`, translated: true });
    expect(resolveListingText(property, 'fr')).toEqual({ ...source, translated: false });
    expect(property.price).toBe(150000); expect(source.description).toContain('150 000 FCFA');
  });
  it('falls back honestly for absent, malformed or incomplete translations and preserves genuinely empty fields', async () => {
    expect(resolveListingText(source, 'ar')).toEqual({ ...source, translated: false });
    const stored = await cache();
    stored.entries[reference].translations.en = { ...translated, description: '' };
    expect(selectCachedTranslations(reference, source, stored)).toEqual({});
    stored.entries[reference].translations.en = { ...translated, commercial_message: 'Invented new claim' };
    expect(selectCachedTranslations(reference, source, stored)).toEqual({});
    const empty = { title: '', commercial_message: '', description: '' };
    expect(resolveListingText({ ...empty, translations: { ar: empty } }, 'ar')).toEqual({ ...empty, translated: false });
  });
  it('refuses unbound legacy maps, invalid hashes and invalid cache versions without invoking source getters', async () => {
    expect(selectCachedTranslations(reference, source, { [reference]: { en: translated } })).toEqual({});
    const stored = await cache(); stored.entries[reference].sourceHash = 'invalid';
    expect(selectCachedTranslations(reference, source, stored)).toEqual({});
    expect(selectCachedTranslations(reference, source, { ...stored, version: 2 })).toEqual({});
    const getter = vi.fn(() => source.title);
    expect(() => normalizeListingText(Object.defineProperty({ ...source }, 'title', { get: getter }))).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects wrong types and oversized or unsupported strings rather than coercing, trimming or cutting them', () => {
    for (const input of [null, [], { ...source, title: 123 }, { ...source, title: 'x'.repeat(301) }, { ...source, description: 'x'.repeat(10001) },
      { ...source, title: 'Titre\0fictif' }, { ...source, description: '\ud800' }]) expect(() => normalizeListingText(input)).toThrow();
    const original = Object.freeze({ ...source, title: '  Titre fictif  ', description: '  Première ligne\nDeuxième ligne  ' });
    expect(normalizeListingText(original)).toEqual(original);
  });
  it('keeps a historical oversized French source readable without a translation or truncated replacement', () => {
    const historical = { ...source, description: 'Description fictive '.repeat(600), translations: { en: translated } };
    expect(() => normalizeListingText(historical)).toThrow();
    expect(selectCachedTranslations(reference, historical, { version: 1, entries: {} })).toEqual({});
    expect(resolveListingText(historical, 'en')).toEqual({ title: historical.title, commercial_message: '', description: historical.description, translated: false });
  });
  it('projects only the active narrative into catalogue props while keeping French and structured facts intact', () => {
    const property = Object.freeze({ ...source, price: 150000, reference, images: ['photo.jpg'], translations: { en: translated, ar: { ...translated, title: 'عنوان' } } });
    const displayed = listingDisplayView(property, 'en');
    expect(displayed).toEqual({ ...translated, price: 150000, reference, images: ['photo.jpg'] });
    expect(displayed).not.toHaveProperty('translations');
    expect(property.title).toBe(source.title); expect(property.translations.ar.title).toBe('عنوان');
  });
  it('serializes a translated JSON-LD title as data, including hostile closing tags and line separators', () => {
    const listing = { name: '</script><img src=x onerror=alert(1)>', description: 'Fictif\u2028suite\u2029fin', price: 150000 };
    const encoded = serializeJsonLd(listing);
    expect(encoded).not.toContain('</script>'); expect(encoded).not.toContain('<img');
    expect(JSON.parse(encoded)).toEqual(listing);
  });
});
