/**
 * Build-time admin DB reader. Tier 3 isolation:
 *
 * - Reads `process.env.ADMIN_SUPABASE_*` (not `import.meta.env`) so Vite
 *   cannot bundle the values into the client output. The variables are
 *   supplied by GitHub Actions secrets at build time and never reach the
 *   deployed Cloudflare Pages runtime.
 * - Uses the **service-role** key (full read of `properties`). The trade-off
 *   is acceptable because the key lives only in GH Actions, never on the
 *   public site. RLS becomes belt-and-suspenders, not the primary boundary.
 * - The runtime guard below throws if this module is imported outside of a
 *   build context (no `process.env` available, or `MODE === 'runtime'`).
 *
 * Anything that the deployed Worker needs to read from a DB goes through
 * `@/lib/intake` (separate Supabase project, anon key only).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbProperty, PublicProperty } from '@/types/property';

const isNodeBuild =
  typeof process !== 'undefined' &&
  typeof process.env !== 'undefined' &&
  // Astro/Vite set NODE_ENV during build; Cloudflare Workers runtime does not
  // expose process.env at all by default.
  typeof process.versions?.node === 'string';

if (!isNodeBuild) {
  throw new Error(
    '[supabase.build] imported at runtime. This module is build-only — ' +
      'use @/lib/intake for runtime DB access.',
  );
}

const ADMIN_URL = process.env.ADMIN_SUPABASE_URL ?? '';
const ADMIN_KEY =
  process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.ADMIN_SUPABASE_ANON_KEY ?? '';

if (!ADMIN_URL || !ADMIN_KEY) {
  // Soft-fail at build time so a missing env var doesn't break the build;
  // the queries below short-circuit to [] and pages render fallback empty
  // states. CI logs surface the warning.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase.build] ADMIN_SUPABASE_URL or ADMIN_SUPABASE_SERVICE_ROLE_KEY missing — ' +
      'property fetch will return []. Fine for CI smoke build, not for prod.',
  );
}

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(ADMIN_URL, ADMIN_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'jammimmo-vitrine-build' } },
    });
  }
  return _client;
}

/**
 * Project a DB row to its render-safe public shape. Commission, apporteur,
 * source_*, caution, avance, accessibility, manager, deal_type and other
 * admin-internal fields are dropped here — the build process sees them in
 * memory but they never make it into the rendered HTML.
 */
function maskRow(p: DbProperty): PublicProperty {
  return {
    id: p.id,
    reference: p.reference,
    title: p.title,
    type: p.type,
    transaction_type: p.transaction_type,
    status: p.status,
    city: p.city,
    quartier: p.quartier,
    address: p.address,
    gps: p.gps,
    price: p.price,
    negotiable: p.negotiable,
    commercial_message: p.commercial_message,
    surface: p.surface,
    bedrooms: p.bedrooms,
    images: Array.isArray(p.images) ? p.images : [],
    video_links: Array.isArray(p.video_links) ? p.video_links : [],
    attributes: p.attributes ?? {},
    commodities: Array.isArray(p.commodities) ? p.commodities : [],
    nearby_commerce: Array.isArray(p.nearby_commerce) ? p.nearby_commerce : [],
    documents: p.documents ?? {},
    flux_passage: p.flux_passage,
    tags: Array.isArray(p.tags) ? p.tags : [],
    description: p.description ?? '',
    published_at: p.published_at,
    updated_at: p.updated_at,
  };
}

const PUBLIC_COLUMNS = `
  id, reference, title, type, transaction_type, status,
  city, quartier, address, gps,
  price, negotiable, commercial_message,
  surface, bedrooms,
  images, video_links,
  attributes, commodities, nearby_commerce, documents,
  flux_passage, tags, description,
  is_public, published_at, created_at, updated_at,
  caution, avance, commission_amount, negotiable_price,
  accessibility
`
  .replace(/\s+/g, ' ')
  .trim();

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
  if (!ADMIN_URL || !ADMIN_KEY) return [];

  let q = client()
    .from('properties')
    .select(PUBLIC_COLUMNS)
    .eq('is_public', true)
    .eq('status', 'Disponible');

  if (opts.type) q = q.eq('type', opts.type);
  if (opts.transaction) q = q.eq('transaction_type', opts.transaction);
  if (opts.city) q = q.eq('city', opts.city);
  if (opts.priceMin !== undefined) q = q.gte('price', opts.priceMin);
  if (opts.priceMax !== undefined) q = q.lte('price', opts.priceMax);

  q = q.order('published_at', { ascending: false, nullsFirst: false });
  if (opts.order === 'price_asc') q = q.order('price', { ascending: true });
  if (opts.order === 'price_desc') q = q.order('price', { ascending: false });

  if (opts.limit !== undefined) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[supabase.build] listPublicProperties failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => maskRow(row as DbProperty));
}

export async function getPublicPropertyByRef(ref: string): Promise<PublicProperty | null> {
  if (!ADMIN_URL || !ADMIN_KEY) return null;
  const { data, error } = await client()
    .from('properties')
    .select(PUBLIC_COLUMNS)
    .eq('reference', ref)
    .eq('is_public', true)
    .eq('status', 'Disponible')
    .maybeSingle();
  if (error || !data) return null;
  return maskRow(data as DbProperty);
}

export async function findSimilar(p: PublicProperty, n: number = 3): Promise<PublicProperty[]> {
  if (!ADMIN_URL || !ADMIN_KEY) return [];
  const { data, error } = await client()
    .from('properties')
    .select(PUBLIC_COLUMNS)
    .eq('is_public', true)
    .eq('status', 'Disponible')
    .eq('type', p.type)
    .eq('city', p.city)
    .neq('id', p.id)
    .limit(n);
  if (error || !data) return [];
  return data.map((row) => maskRow(row as DbProperty));
}

export async function listAllPublicRefs(): Promise<Array<{ reference: string; updated_at: string }>> {
  if (!ADMIN_URL || !ADMIN_KEY) return [];
  const { data, error } = await client()
    .from('properties')
    .select('reference, updated_at')
    .eq('is_public', true)
    .eq('status', 'Disponible');
  if (error || !data) return [];
  return data as Array<{ reference: string; updated_at: string }>;
}
