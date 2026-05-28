import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Webhook endpoint called by the admin Supabase project when a property row
 * changes (typically the `is_public` flag flipping). Verifies an HMAC-SHA256
 * signature against the raw body, debounces via Workers KV (60 s window),
 * then triggers a Cloudflare Pages production rebuild via a Deploy Hook URL.
 *
 * Required env vars:
 *   - REVALIDATE_HMAC_SECRET     shared with admin DB trigger
 *   - REVALIDATE_DEPLOY_HOOK_URL CF Pages Deploy Hook URL (full path)
 *
 * KV binding (wrangler.toml): REFRESH_KV (namespace).
 *
 * Admin-side trigger (pg_net + pgcrypto) computes:
 *   signature = hex(hmac_sha256(body, REVALIDATE_HMAC_SECRET))
 *   headers:
 *     x-vitrine-signature: <signature>
 *     x-vitrine-timestamp: <unix-seconds>
 * The timestamp must be within 5 min of `now` to mitigate replay.
 */

interface CFLocals {
  runtime?: { env?: Record<string, unknown> };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as CFLocals).runtime?.env ?? {};
  const secret =
    (env.REVALIDATE_HMAC_SECRET as string | undefined) ?? import.meta.env.REVALIDATE_HMAC_SECRET;
  const deployHookUrl =
    (env.REVALIDATE_DEPLOY_HOOK_URL as string | undefined) ??
    import.meta.env.REVALIDATE_DEPLOY_HOOK_URL;
  const kv = env.REFRESH_KV as KVNamespace | undefined;

  if (!secret || !deployHookUrl) {
    return json({ error: 'Server misconfigured' }, 500);
  }

  const sigHeader = request.headers.get('x-vitrine-signature') ?? '';
  const tsHeader = request.headers.get('x-vitrine-timestamp') ?? '';
  if (!sigHeader || !tsHeader) {
    return json({ error: 'Missing signature headers' }, 401);
  }

  const ts = Number(tsHeader);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) {
    return json({ error: 'Stale or invalid timestamp' }, 401);
  }

  const raw = await request.text();
  const ok = await verifyHmac(secret, raw, sigHeader);
  if (!ok) {
    return json({ error: 'Bad signature' }, 401);
  }

  // 60 s debounce — collapses bursts of admin updates into one build.
  if (kv) {
    const lock = await kv.get('pending');
    const now = Date.now();
    if (lock && now - Number(lock) < 60_000) {
      return json({ status: 'debounced' }, 202);
    }
    await kv.put('pending', String(now), { expirationTtl: 90 });
  }

  const hookRes = await fetch(deployHookUrl, { method: 'POST' });
  if (!hookRes.ok) {
    const detail = await hookRes.text().catch(() => '');
    return json({ error: 'Deploy hook failed', status: hookRes.status, detail }, 502);
  }
  const hookBody = (await hookRes.json().catch(() => ({}))) as { result?: { id?: string } };
  return json(
    { status: 'dispatched', deployment_id: hookBody?.result?.id, at: new Date().toISOString() },
    202,
  );
};

async function verifyHmac(secret: string, body: string, sigHex: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const macBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const macHex = [...new Uint8Array(macBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(macHex, sigHex.toLowerCase().trim());
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
