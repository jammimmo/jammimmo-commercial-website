import type { APIRoute } from 'astro';
import { z } from 'zod';
import { insertView } from '@/lib/intake';

export const prerender = false;

const ViewSchema = z.object({
  property_id: z.string().uuid(),
  referrer: z.string().max(500).nullable().optional(),
});

interface CFLocals {
  runtime?: { env?: { INTAKE_DB?: D1Database } };
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = ViewSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 204 });

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? '';
  const country = request.headers.get('cf-ipcountry') ?? null;

  const db = (locals as CFLocals).runtime?.env?.INTAKE_DB;
  await insertView(db, {
    property_id: parsed.data.property_id,
    ip_hash: ip ? await hashIp(ip) : null,
    country,
    referrer: parsed.data.referrer ?? null,
  });

  return new Response(null, { status: 204 });
};
