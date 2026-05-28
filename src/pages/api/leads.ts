import type { APIRoute } from 'astro';
import { z } from 'zod';
import { insertLead } from '@/lib/intake';

export const prerender = false;

const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;

const LeadSchema = z.object({
  property_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  full_name: z.string().min(2).max(200),
  phone: z
    .string()
    .min(4)
    .max(32)
    .refine((v) => phoneSn.test(v) || phoneLoose.test(v)),
  email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  message: z.string().max(2000).optional(),
});

interface CFLocals {
  runtime?: { env?: { INTAKE_DB?: D1Database; REFRESH_KV?: KVNamespace } };
}

/**
 * Allowed Origin hosts for CORS-protected POST. Anything else is rejected
 * with 403. Includes the canonical domain and `*.jammimmo-vitrine.pages.dev`
 * preview branches (CF Pages preview deploys).
 */
const ALLOWED_HOSTS = new Set(['jammimmo.com', 'www.jammimmo.com']);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (ALLOWED_HOSTS.has(u.host)) return true;
    if (u.host.endsWith('.jammimmo-vitrine.pages.dev')) return true;
    return false;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // 1. Same-origin enforcement. Browsers always set `Origin` on cross-site
  // POST; lack of it is fine for same-origin fetches that don't include it.
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return json({ error: 'Forbidden origin' }, 403);
  }

  // 2. Strict Content-Type. Without this, attackers can send `text/plain`
  //    JSON from a malicious site (no CORS preflight, "simple request")
  //    to drive-by-insert leads from a visitor's browser.
  const ct = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (ct !== 'application/json') {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  // 3. Per-IP rate limit: 5 leads / IP / hour (KV-backed). Resilient enough
  //    against casual scripts; CF WAF is the proper outer line of defence.
  const kv = (locals as CFLocals).runtime?.env?.REFRESH_KV;
  if (kv) {
    const ip = clientAddress ?? request.headers.get('cf-connecting-ip') ?? 'unknown';
    const key = `leads:rl:${ip}`;
    const raw = await kv.get(key);
    const count = raw ? Number(raw) : 0;
    if (count >= 5) {
      return json({ error: 'Too many leads. Try again later.' }, 429);
    }
    // 1-hour rolling window
    await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  // 4. Body size cap. Even with Zod, parse cost is real on giant bodies.
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 8192) {
    return json({ error: 'Payload too large' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const db = (locals as CFLocals).runtime?.env?.INTAKE_DB;
  const result = await insertLead(db, parsed.data);
  if (!result.ok) {
    // Don't leak DB error details to the client; log server-side
    console.warn('[leads] insert failed:', result.error);
    return json({ error: 'Insert failed' }, 500);
  }

  return json({ ok: true }, 201);
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
