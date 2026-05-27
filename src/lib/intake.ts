/**
 * Runtime intake writer — Cloudflare D1.
 *
 * Tier 3 isolation:
 * - The vitrine writes leads + views to a D1 database accessed via the
 *   `INTAKE_DB` binding declared in wrangler.toml. There is no API key on
 *   the wire; D1 access is a Worker-level capability that only this worker
 *   has. Compromise of the deployed worker can spam this DB at worst; it
 *   cannot read or write the admin Supabase project.
 * - Only `insertLead` and `insertView` are exposed. Nothing in this module
 *   does SELECT/UPDATE/DELETE — even though D1 has no RLS-style guard, the
 *   worker code is the only thing that can touch the binding, and this file
 *   is the only thing in the worker that uses it.
 *
 * The admin-side mirror worker reads via the D1 HTTP API with an account
 * token (separate PR, separate credential).
 */

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

export async function insertLead(
  db: D1Database | undefined,
  payload: LeadPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Intake DB not configured' };
  try {
    await db
      .prepare(
        `INSERT INTO leads
           (id, property_id, full_name, phone, email, message, source, status)
         VALUES (?, ?, ?, ?, ?, ?, 'vitrine', 'nouveau')`,
      )
      .bind(
        crypto.randomUUID(),
        payload.property_id ?? null,
        payload.full_name,
        payload.phone,
        payload.email ?? null,
        payload.message ?? null,
      )
      .run();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Insert failed' };
  }
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
