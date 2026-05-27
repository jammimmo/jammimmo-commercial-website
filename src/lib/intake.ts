/**
 * Runtime intake writer. Tier 3 isolation:
 *
 * Cloudflare Pages Functions only ever talk to the intake Supabase project
 * (anon key + RLS INSERT policy). If a hacker pulls these credentials off
 * the deployed Worker, the blast radius is bounded to the intake DB — they
 * cannot read or write any admin data.
 *
 * Reads `import.meta.env.INTAKE_SUPABASE_*` (NOT the admin keys). Schema is
 * owned by `supabase/intake/migrations/` in this same repo.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface LeadPayload {
  property_id?: string;
  full_name: string;
  phone: string;
  email?: string;
  message?: string;
}

export interface ViewPayload {
  property_id: string;
  ip_hash: string | null;
  country: string | null;
  referrer: string | null;
}

let _client: SupabaseClient | null = null;
function client(url: string, anon: string): SupabaseClient {
  if (!_client) {
    _client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'jammimmo-vitrine-runtime' } },
    });
  }
  return _client;
}

function env(): { url: string; anon: string } | null {
  const url = import.meta.env.INTAKE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.INTAKE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return null;
  return { url, anon };
}

export async function insertLead(payload: LeadPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = env();
  if (!e) return { ok: false, error: 'Intake DB not configured' };
  const { error } = await client(e.url, e.anon).from('leads').insert({
    property_id: payload.property_id ?? null,
    full_name: payload.full_name,
    phone: payload.phone,
    email: payload.email ?? null,
    message: payload.message ?? null,
    source: 'vitrine',
    status: 'nouveau',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function insertView(payload: ViewPayload): Promise<void> {
  const e = env();
  if (!e) return;
  // Fire and forget — beacon writes never bubble errors to the client.
  await client(e.url, e.anon)
    .from('property_views')
    .insert(payload)
    .then(() => undefined, () => undefined);
}
