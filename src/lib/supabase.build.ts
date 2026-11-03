/**
 * Build-only public catalogue reader. The trusted wrapper prepares/validates a
 * complete immutable revision before Astro starts. No database client, secret,
 * network fallback or empty-on-error path exists in the renderer.
 */
import catalogueRaw from '@catalogue-public?raw';
import rawApproval from '@catalogue-approval';
import { validateCatalogue, validateCatalogueApproval, type PublicCatalogue } from './public-catalogue';
import type { PublicProperty } from '@/types/property';
import listingLocalizations from '@/data/listing-localizations.json';
import { selectCachedTranslations } from '@/lib/listing-localization';

if (typeof process === 'undefined' || typeof process.versions?.node !== 'string') {
  throw new Error('[supabase.build] imported at runtime; public catalogue readers are build-only');
}
const approval = validateCatalogueApproval(rawApproval);
const mode = process.env.CATALOGUE_BUILD_SOURCE;
if (mode !== undefined && !['public-snapshot-20261031', 'prepared-production'].includes(mode)) {
  throw new Error('[supabase.build] invalid CATALOGUE_BUILD_SOURCE');
}
if ((mode === 'prepared-production') !== (approval.source === 'trusted-production')) {
  throw new Error('[supabase.build] catalogue source mismatch');
}
if (mode === 'public-snapshot-20261031' && process.env.CATALOGUE_SNAPSHOT_SHA256 !== approval.catalogueSha256) {
  throw new Error('[supabase.build] public snapshot hash missing or mismatched');
}
let cataloguePromise: Promise<PublicCatalogue> | undefined;
async function publicCatalogue(): Promise<PublicCatalogue> {
  cataloguePromise ??= (async () => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(catalogueRaw));
    const actual = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== approval.catalogueSha256) throw new Error('[supabase.build] catalogue hash mismatch');
    const catalogue = validateCatalogue(JSON.parse(catalogueRaw), approval.capture);
    // Overlay only after the public artifact and its source hash are validated.
    // French facts remain unchanged; stale/missing narrative cache has no overlay.
    return { ...catalogue, properties: catalogue.properties.map(property => {
      const translations = selectCachedTranslations(property.reference, property, listingLocalizations);
      return Object.keys(translations).length ? { ...property, translations } : property;
    }) };
  })();
  return cataloguePromise;
}

export async function listPublicProperties(
  opts: {
    limit?: number;
    order?: 'published_at_desc' | 'price_asc' | 'price_desc';
    type?: string;
    transaction?: string;
    city?: string;
    priceMin?: number;
    priceMax?: number;
  } = {},
): Promise<PublicProperty[]> {
  const catalogue = await publicCatalogue();
  const rows = catalogue.properties.filter(p => (!opts.type || p.type === opts.type)
    && (!opts.transaction || p.transaction_type === opts.transaction)
    && (!opts.city || p.city === opts.city)
    && (opts.priceMin === undefined || p.price >= opts.priceMin)
    && (opts.priceMax === undefined || p.price <= opts.priceMax));
  // Preserve the existing publication-date primary sort and stable ties.
  rows.sort((a, b) => {
    const published = a.published_at === null ? (b.published_at === null ? 0 : 1)
      : b.published_at === null ? -1 : Date.parse(b.published_at) - Date.parse(a.published_at);
    return published || (opts.order === 'price_asc' ? a.price - b.price : opts.order === 'price_desc' ? b.price - a.price : 0);
  });
  return structuredClone(opts.limit === undefined ? rows : rows.slice(0, Math.max(0, opts.limit)));
}

export async function getPublicPropertyByRef(ref: string): Promise<PublicProperty | null> {
  const catalogue = await publicCatalogue();
  return structuredClone(catalogue.properties.find(p => p.reference.toLowerCase() === ref.toLowerCase()) ?? null);
}

export async function findSimilar(p: PublicProperty, n: number = 3): Promise<PublicProperty[]> {
  const catalogue = await publicCatalogue();
  return structuredClone(catalogue.properties.filter(candidate => candidate.id !== p.id && candidate.type === p.type && candidate.city === p.city).slice(0, Math.max(0, n)));
}

export async function listAllPublicRefs(): Promise<Array<{ reference: string; updated_at: string; images: string[] }>> {
  const catalogue = await publicCatalogue();
  return catalogue.properties.map(p => ({ reference: p.reference, updated_at: p.updated_at, images: p.images.slice(0, 10) }));
}
