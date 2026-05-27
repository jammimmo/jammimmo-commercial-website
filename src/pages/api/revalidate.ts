import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Webhook endpoint that Supabase calls when a row in `properties` changes
 * its `is_public` flag (or any commercially-relevant column). Verifies an
 * HMAC signature, then triggers a Cloudflare Pages Deploy Hook.
 *
 * Setup:
 *   1. Generate a long random secret → set as REVALIDATE_SECRET on Pages.
 *   2. In Supabase Studio, add a webhook on `properties`:
 *        URL: https://jammimmo.com/api/revalidate
 *        HTTP method: POST
 *        HTTP headers: { 'x-signature': '<computed HMAC>' }
 *      (Use a Postgres function + pg_net + crypto.sign() for HMAC, or use
 *       Supabase's built-in 'Authorization' header with a pre-shared secret —
 *       see comment below for the simpler header check fallback.)
 *   3. Get the Deploy Hook URL from Pages → Builds & deployments → Deploy
 *      hooks → set as DEPLOY_HOOK_URL.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.REVALIDATE_SECRET;
  const hookUrl = import.meta.env.DEPLOY_HOOK_URL;

  if (!secret || !hookUrl) {
    return json({ error: 'Server misconfigured' }, 500);
  }

  // Simple shared-secret check via Authorization header. Replace with full
  // HMAC of the body for production-grade security.
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return json({ error: 'Forbidden' }, 403);
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST' });
    if (!res.ok) {
      return json({ error: 'Deploy hook failed', status: res.status }, 502);
    }
  } catch (e: any) {
    return json({ error: 'Deploy hook fetch error', details: e?.message }, 502);
  }

  return json({ ok: true, triggered_at: new Date().toISOString() }, 200);
};

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
