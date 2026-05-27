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
  runtime?: { env?: { INTAKE_DB?: D1Database } };
}

export const POST: APIRoute = async ({ request, locals }) => {
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
    return json({ error: 'Insert failed', details: result.error }, 500);
  }

  return json({ ok: true }, 201);
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
