/**
 * Runtime intake writer — Cloudflare D1.
 *
 * Tier 3 isolation:
 * - The vitrine writes leads + views to a D1 database accessed via the
 *   `INTAKE_DB` binding declared in wrangler.toml. There is no API key on
 *   the wire; D1 access is a Worker-level capability that only this worker
 *   has. Compromise of the deployed worker can spam this DB at worst; it
 *   cannot read or write the admin Supabase project.
 * - Qualified acceptance reads only an original UUID and compares the complete
 *   normalized intent. No public GET or generic query is exposed. Recovery
 *   never inserts and an absent/purged row is never acknowledgement.
 *
 * The management Worker uses its separate COMMERCIAL_INTAKE_DB D1 binding.
 * Neither path needs a reusable D1 HTTP API token.
 */
import { parseQualifiedLeadEnvelope } from './qualified-lead-wire';
import type { RateLimitDecision } from './intake-rate-limit';

export interface LeadPayload {
  property_id?: string;
  property_reference?: string;
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

export async function insertLead(
  db: D1Database | undefined,
  payload: LeadPayload,
): Promise<{ ok: true } | { ok: false; reason: 'not_configured' | 'write_failed' }> {
  if (!db) return { ok: false, reason: 'not_configured' };
  try {
    const result = await db
      .prepare(
        `INSERT INTO leads
           (id, property_id, property_reference, full_name, phone, email, message, source, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'vitrine', 'nouveau')`,
      )
      .bind(
        crypto.randomUUID(),
        payload.property_id ?? null,
        payload.property_reference ?? null,
        payload.full_name,
        payload.phone,
        payload.email ?? null,
        payload.message ?? null,
      )
      .run();
    return result.success === true && result.meta?.changes === 1 ? { ok: true } : { ok: false, reason: 'write_failed' };
  } catch {
    return { ok: false, reason: 'write_failed' };
  }
}

export type QualifiedIntakeResult = { status: 'accepted' | 'replayed'; submissionId: string }
  | { status: 'unconfirmed' | 'conflict' | 'invalid' | 'limited' | 'unavailable' };
export async function qualifiedLeadFingerprint(canonicalBusinessJSON: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalBusinessJSON));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Native burst limit applies to every route request. Only new initial attempts
 * consume hourly write quota. Racing attempts may conservatively consume two
 * quota slots but PK uniqueness prevents two leads for the same original UUID.
 * Recovery is existing-only: normal purge can remove the row and leave a hold.
 */
export async function acceptQualifiedLead(db: D1Database | undefined, input: unknown,
  consumeNew: () => Promise<RateLimitDecision>): Promise<QualifiedIntakeResult> {
  const parsed = parseQualifiedLeadEnvelope(input);
  if (parsed.ok === false) return { status: 'invalid' };
  if (!db) return { status: 'unavailable' };
  const { value, business, canonicalBusinessJSON } = parsed;
  try {
    const fingerprint = await qualifiedLeadFingerprint(canonicalBusinessJSON), qualificationJSON = JSON.stringify(business.qualification);
    const lookup = () => db.prepare(`SELECT id, property_id, property_reference, full_name, phone, email, message,
      qualification_json, business_fingerprint FROM leads WHERE id = ?`).bind(value.submission_id).first<Record<string, unknown>>();
    const matches = (row: Record<string, unknown>) => row.id === value.submission_id && row.property_id === null
      && row.property_reference === business.property_reference && row.full_name === business.full_name && row.phone === business.phone
      && row.email === business.email && row.message === business.message && row.qualification_json === qualificationJSON
      && row.business_fingerprint === fingerprint;
    const previous = await lookup();
    if (previous) return matches(previous) ? { status: 'replayed', submissionId: value.submission_id } : { status: 'conflict' };
    if (value.delivery_mode === 'recover') return { status: 'unconfirmed' };
    const quota = await consumeNew();
    if (quota !== 'allowed') return { status: quota === 'limited' ? 'limited' : 'unavailable' };
    let verifiedInsert = false;
    try {
      const result = await db.prepare(`INSERT INTO leads
        (id, property_id, property_reference, full_name, phone, email, message, source, status, qualification_json, business_fingerprint)
        VALUES (?, NULL, ?, ?, ?, ?, ?, 'vitrine', 'nouveau', ?, ?) ON CONFLICT(id) DO NOTHING`)
        .bind(value.submission_id, business.property_reference, business.full_name, business.phone, business.email,
          business.message, qualificationJSON, fingerprint).run();
      verifiedInsert = result.success === true && result.meta?.changes === 1;
    } catch { /* A lost write reply can only be confirmed by the exact row below. */ }
    const current = await lookup();
    if (!current) return { status: 'unavailable' };
    if (!matches(current)) return { status: 'conflict' };
    return { status: verifiedInsert ? 'accepted' : 'replayed', submissionId: value.submission_id };
  } catch { return { status: 'unavailable' }; }
}

export async function insertView(db: D1Database | undefined, payload: ViewPayload): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO property_views (id, property_id, ip_hash, country, referrer)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        payload.property_id,
        payload.ip_hash,
        payload.country,
        payload.referrer,
      )
      .run();
  } catch {
    // Beacon: never bubble errors to the visitor.
  }
}
