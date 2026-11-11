import type { APIRoute } from 'astro';
import { z } from 'zod';
import { acceptQualifiedLead, insertLead } from '@/lib/intake';
import { parseQualifiedLeadEnvelope, PublicLeadIdentitySchema, type QualifiedLeadAcknowledgement } from '@/lib/qualified-lead-wire';
import { hashClientIp, isAllowedIntakeOrigin, isJsonContentType } from '@/lib/intake-security';
import { PayloadTooLargeError, readBoundedRequestText } from '@/lib/bounded-request';
import { consumeD1FixedWindow } from '@/lib/intake-rate-limit';

export const prerender = false;
interface IntakeEnv {
  INTAKE_DB?: D1Database; INTAKE_IP_HASH_SALT?: string; INTAKE_ALLOWED_ORIGIN?: string;
}
interface CFLocals { runtime?: { env?: IntakeEnv } }
// Preserve unqualified property_id callers. Qualified bodies are closed and
// may carry only a public property_reference, never a management UUID.
const LegacySchema = PublicLeadIdentitySchema.extend({
  property_id: z.string().uuid().or(z.literal('')).optional().transform(value => value || undefined),
}).refine(value => !(value.property_id && value.property_reference));

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // Astro4/CF11 snapshot: use locals, not a cloudflare:workers runtime upgrade.
  const env = (locals as CFLocals).runtime?.env;
  if (!isAllowedIntakeOrigin(request.headers.get('origin'), env?.INTAKE_ALLOWED_ORIGIN, import.meta.env.DEV)) return json({ error: 'Forbidden origin' }, 403);
  if (!isJsonContentType(request.headers.get('content-type'))) return json({ error: 'Content-Type must be application/json' }, 415);
  const db = env?.INTAKE_DB, ip = clientAddress || request.headers.get('cf-connecting-ip'), salt = env?.INTAKE_IP_HASH_SALT;
  if (!db || !ip || !salt || salt.length < 16) return unavailable();
  let ipHash: string;
  try { ipHash = await hashClientIp(ip, salt); } catch { return unavailable(); }
  const burst = await consumeD1FixedWindow(db, 'lead-burst:' + ipHash, 10, 60, { pruneOnNewWindow: true });
  if (burst === 'limited') return limited('60');
  if (burst !== 'allowed') return unavailable();
  let body: unknown;
  try { body = JSON.parse(await readBoundedRequestText(request, 8192)); }
  catch (error) { return error instanceof PayloadTooLargeError ? json({ error: 'Payload too large' }, 413) : json({ error: 'Invalid JSON' }, 400); }
  const hourly = () => consumeD1FixedWindow(db, 'lead-hour:' + ipHash, 5, 3600);
  const qualified = !!body && typeof body === 'object' && ['qualification', 'submission_id', 'delivery_mode']
    .some(key => Object.prototype.hasOwnProperty.call(body, key));
  if (qualified) {
    const parsed = parseQualifiedLeadEnvelope(body);
    if (parsed.ok === false) return json({ error: 'Validation failed', issues: parsed.issues }, 422);
    const result = await acceptQualifiedLead(db, parsed.value, hourly);
    if (result.status === 'accepted' || result.status === 'replayed') {
      const ack: QualifiedLeadAcknowledgement = { ok: true, submission_id: result.submissionId, qualification_version: 1 };
      return json(ack, result.status === 'accepted' ? 201 : 200);
    }
    if (result.status === 'unconfirmed') return json({ ok: false, status: 'unconfirmed' }, 202);
    if (result.status === 'conflict') return json({ ok: false, error: 'submission_conflict' }, 409);
    if (result.status === 'limited') return limited('3600');
    if (result.status === 'invalid') return json({ error: 'Validation failed' }, 422);
    console.warn('[leads] intake unavailable', { reason: 'qualified_write_failed' });
    return unavailable();
  }
  const parsed = LegacySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Validation failed', issues: parsed.error.issues.map(issue => ({
    path: issue.path.length ? String(issue.path[0]) : '$', code: 'invalid_identity',
  })) }, 422);
  const quota = await hourly();
  if (quota === 'limited') return limited('3600');
  if (quota !== 'allowed') return unavailable();
  const result = await insertLead(db, parsed.data);
  if (result.ok === false) { console.warn('[leads] intake unavailable', { reason: result.reason }); return unavailable(); }
  return json({ ok: true }, 201);
};
const limited = (seconds: string) => json({ error: 'Too many leads. Try again later.' }, 429, { 'Retry-After': seconds });
const unavailable = () => json({ error: 'Intake temporarily unavailable' }, 503, { 'Retry-After': '60' });
function json(payload: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
}
