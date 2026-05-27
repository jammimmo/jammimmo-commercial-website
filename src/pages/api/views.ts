import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const ViewSchema = z.object({
  property_id: z.string().uuid(),
  referrer: z.string().max(500).nullable().optional(),
});

/**
 * Hash the visitor IP with sha-256 and truncate to 16 chars. Cookie-less,
 * GDPR-friendly — we can never recover the IP, only correlate the same
 * visitor across views in the same hour.
 */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export const POST: APIRoute = async ({ request }) => {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Don't 500 the beacon — just no-op so frontend never bubbles a banner.
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = ViewSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 204 });

  // Cloudflare-injected headers
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? '';
  const country = request.headers.get('cf-ipcountry') ?? null;

  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'jammimmo-vitrine-api' } },
  });

  await sb.from('property_views').insert({
    property_id: parsed.data.property_id,
    ip_hash: ip ? await hashIp(ip) : null,
    country,
    referrer: parsed.data.referrer ?? null,
  });

  return new Response(null, { status: 204 });
};
