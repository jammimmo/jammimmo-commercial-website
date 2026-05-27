/**
 * Supabase client — anon key only. RLS does the auth on the admin side; we
 * only ever SELECT rows where `is_public = true AND status = 'Disponible'`,
 * and INSERT into `leads` + `property_views` (both granted to anon).
 *
 * The URL and key live in Cloudflare Pages env vars (and in `.env` for local
 * dev). At build time they're consumed by SSG pages — the rendered HTML
 * contains zero references to either value. At runtime (the /api/* route
 * handlers) they're read from `import.meta.env`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbProperty, PublicProperty } from '@/types/property';

const SUPABASE_URL = import.meta.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Soft-fail at build time so a missing env var doesn't break the build —
  // the queries below short-circuit to [] and pages fall back to demo data.
  // We log instead of throw so CI logs surface the problem.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] SUPABASE_URL or SUPABASE_ANON_KEY missing — public property fetch will return [].',
  );
}

let _client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'jammimmo-vitrine' } },
    });
  }
  return _client;
}

/**
 * Project a DB row to its render-safe public shape. This is where the field
 * masking happens — commission, apporteur, source_*, caution, avance,
 * accessibility, manager, deal_type and the other admin-internal fields are
 * explicitly dropped (the anon RLS returns the full row but the front never
 * keeps them in scope).
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

/** SELECT-only column list — covers every field we mask down to. */
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
`.replace(/\s+/g, ' ').trim();

export async function listPublicProperties(opts: {
  limit?: number;
  order?: 'published_at_desc' | 'price_asc' | 'price_desc';
  type?: string;
  transaction?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
} = {}): Promise<PublicProperty[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  let q = supabase().from('properties').select(PUBLIC_COLUMNS).eq('is_public', true).eq('status', 'Disponible');

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
    console.warn('[supabase] listPublicProperties failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => maskRow(row as DbProperty));
}

export async function getPublicPropertyByRef(ref: string): Promise<PublicProperty | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const { data, error } = await supabase()
    .from('properties')
    .select(PUBLIC_COLUMNS)
    .eq('reference', ref)
    .eq('is_public', true)
    .eq('status', 'Disponible')
    .maybeSingle();
  if (error || !data) return null;
  return maskRow(data as DbProperty);
}

/** Find 3 similar properties — same type + same city, excluding the current id. */
export async function findSimilar(p: PublicProperty, n: number = 3): Promise<PublicProperty[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const { data, error } = await supabase()
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

/** All references — used by getStaticPaths for /biens/[ref] and by sitemap. */
export async function listAllPublicRefs(): Promise<Array<{ reference: string; updated_at: string }>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const { data, error } = await supabase()
    .from('properties')
    .select('reference, updated_at')
    .eq('is_public', true)
    .eq('status', 'Disponible');
  if (error || !data) return [];
  return data as Array<{ reference: string; updated_at: string }>;
}
