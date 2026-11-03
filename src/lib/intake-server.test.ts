import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../pages/api/leads';
import { acceptQualifiedLead, insertLead, qualifiedLeadFingerprint } from './intake';
import { parseQualifiedLeadEnvelope, type QualifiedLeadEnvelope } from './qualified-lead-wire';
import { isAllowedIntakeOrigin, hashClientIp } from './intake-security';
import { consumeD1FixedWindow } from './intake-rate-limit';
import { PayloadTooLargeError, readBoundedRequestText } from './bounded-request';

// Same Node22 builtin-loading convention as the existing chat SQL tests. SQL
// predicates/uniqueness are real SQLite; Cloudflare/Auth/network are not run.
type SqlValue = string | number | null;
interface Sqlite {
  exec(sql: string): void; close(): void;
  prepare(sql: string): {
    run(...args: SqlValue[]): { changes: number | bigint };
    get(...args: SqlValue[]): Record<string, unknown> | undefined;
    all(...args: SqlValue[]): Record<string, unknown>[];
  };
}
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Sqlite };
const opened: Sqlite[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); vi.restoreAllMocks(); });
function database() {
  const sql = new DatabaseSync(':memory:'); opened.push(sql);
  for (const file of ['0001_init.sql', '0002_chat.sql', '0003_lead_sync_delivery.sql', '0004_intake_lead_quota.sql', '0005_lead_qualification_v1.sql'])
    sql.exec(readFileSync(new URL('../../d1/migrations/' + file, import.meta.url), 'utf8'));
  const calls: { method: string; query: string; args: unknown[] }[] = [];
  const faults = { loseLeadWriteAndNextRead: false, loseExactRead: false, rejectInsert: false };
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => T): Promise<T> { const p = queue.then(work); queue = p.then(() => undefined, () => undefined); return p; }
  function statement(query: string, args: unknown[] = []): D1PreparedStatement {
    const record = (method: string) => { calls.push({ method, query, args: structuredClone(args) }); };
    return {
      bind: (...values) => statement(query, values),
      first: <T>() => enqueue(() => {
        record('first');
        if (faults.loseExactRead && query.startsWith('SELECT id,')) { faults.loseExactRead = false; throw new Error('private provider read error'); }
        return (sql.prepare(query).get(...args as SqlValue[]) ?? null) as T | null;
      }),
      all: <T>() => enqueue(() => { record('all'); return { success: true, results: sql.prepare(query).all(...args as SqlValue[]) as T[] }; }),
      run: () => enqueue(() => {
        record('run');
        if (faults.rejectInsert && /INSERT INTO leads/.test(query)) return { success: false };
        const result = sql.prepare(query).run(...args as SqlValue[]);
        if (faults.loseLeadWriteAndNextRead && /INSERT INTO leads/.test(query)) {
          faults.loseLeadWriteAndNextRead = false; faults.loseExactRead = true;
          throw new Error('private provider write error containing submitted data');
        }
        return { success: true, meta: { changes: Number(result.changes) } };
      }),
    };
  }
  const db: D1Database = { prepare: statement, exec: query => enqueue(() => { sql.exec(query); return { count: 0, duration: 0 }; }) };
  const rows = () => sql.prepare('SELECT * FROM leads ORDER BY id').all();
  const inserts = () => calls.filter(call => call.method === 'run' && /INSERT INTO leads/.test(call.query));
  return { sql, db, rows, inserts, calls, faults };
}
const id = 'ee000000-0000-4000-8000-000000000001';
const payload = (extra: Partial<QualifiedLeadEnvelope> = {}): QualifiedLeadEnvelope => ({
  submission_id: id, delivery_mode: 'submit', full_name: 'Prospect entièrement fictif', phone: '+221000000003',
  qualification: { version: 1, operation: 'invest', propertyType: null, propertyTypeOther: null, city: 'Dakar', zone: null,
    budget: { min: 0, max: 60_000_000, currency: 'XOF', basis: 'total' }, urgency: 'browsing',
    financing: { availability: 'no', method: null, other: null }, criteria: { bedrooms: null, features: [], other: null }, additionalNeeds: [] }, ...extra,
});
const allowed = async () => 'allowed' as const;
// Both callers must observe absence before either can pass the quota seam.
// This deterministically exercises both real INSERTs and their PK conflict.
function twoCallerQuota() {
  let arrivals = 0, release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return async () => { if (++arrivals === 2) release(); await gate; return 'allowed' as const; };
}
function env(db: D1Database): Record<string, unknown> {
  return { INTAKE_DB: db, INTAKE_ALLOWED_ORIGIN: 'https://jammimmo.com', INTAKE_IP_HASH_SALT: 'fictional-test-salt-no-secret',
    LEAD_BURST_RL: { limit: async () => ({ success: true }) } };
}
async function post(body: unknown, runtime: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request = new Request('https://jammimmo.com/api/leads', { method: 'POST', headers: { origin: 'https://jammimmo.com', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const response = await POST({ request, locals: { runtime: { env: runtime } }, clientAddress: '192.0.2.7' } as Parameters<typeof POST>[0]);
  if (!(response instanceof Response)) throw new Error('Expected route response');
  return response;
}

describe('public qualified intake — real SQL and bounded HTTP, no Cloudflare execution', () => {
  it('normalizes the six canonical business fields and excludes id/mode from SHA256', async () => {
    const raw = payload({ full_name: '  Prospect entièrement fictif  ', phone: ' +221000000003 ', email: ' Example@Example.invalid ', message: '  Keep message spaces  ', property_reference: ' JM-APT-123 ' });
    const a = parseQualifiedLeadEnvelope(raw), b = parseQualifiedLeadEnvelope({ ...raw, submission_id: 'EE000000-0000-4000-8000-000000000002', delivery_mode: 'recover' });
    expect(a.ok).toBe(true); expect(b.ok).toBe(true); if (a.ok === false || b.ok === false) throw new Error('Expected wire');
    const exact = JSON.stringify({ full_name: 'Prospect entièrement fictif', phone: '+221000000003', email: 'example@example.invalid', message: '  Keep message spaces  ', property_reference: 'JM-APT-123', qualification: raw.qualification });
    expect(a.canonicalBusinessJSON).toBe(exact); expect(b.canonicalBusinessJSON).toBe(exact);
    expect(await qualifiedLeadFingerprint(exact)).toBe(createHash('sha256').update(exact, 'utf8').digest('hex'));
    expect(b.value.submission_id).toBe('ee000000-0000-4000-8000-000000000002');
  });

  it('closes the qualified envelope and rejects management IDs, UUIDv7 or malformed qualification without leaking values', () => {
    const privateValue = 'private-person@example.invalid';
    for (const input of [
      { ...payload(), property_id: id }, { ...payload(), property_reference: id }, { ...payload(), submission_id: id.replace('-4000-', '-7000-') },
      { ...payload(), delivery_mode: 'retry' }, { ...payload(), qualification: null }, { ...payload(), qualification: { version: 99 } },
      { ...payload(), [privateValue]: privateValue }, { ...payload(), phone: '.......' },
    ]) {
      const result = parseQualifiedLeadEnvelope(input); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(privateValue);
    }
  });

  it('rejects NUL in qualified free strings before any D1 query instead of accepting an unmirrorable lead', async () => {
    const d = database();
    const inputs = [payload({ message: 'private\u0000value' }), payload({ qualification: { ...payload().qualification, city: 'Dakar\u0000' } })];
    for (const input of inputs) {
      const parsed = parseQualifiedLeadEnvelope(input); expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.issues).toContainEqual({ path: input.message ? 'message' : 'qualification.city', code: 'unsupported_storage_text' });
      expect((await post(input, env(d.db))).status).toBe(422);
    }
    expect(d.calls).toEqual([]); expect(d.rows()).toEqual([]);
  });

  it('rejects isolated surrogates but preserves accented text and correctly paired emoji', async () => {
    for (const invalid of ['\ud800', '\udfff', 'x\ud83dy']) expect(parseQualifiedLeadEnvelope(payload({ message: invalid })).ok).toBe(false);
    const d = database(), input = payload({ message: 'Déclaration fictive : entrée séparée 😀', qualification: { ...payload().qualification, city: 'Ngor — à préciser 😀' } });
    expect((await post(input, env(d.db))).status).toBe(201); expect(d.rows()[0].message).toBe(input.message);
    expect(JSON.parse(String(d.rows()[0].qualification_json)).city).toBe(input.qualification.city);
  });

  it('keeps legacy unqualified property_id submissions and their old ACK shape', async () => {
    const d = database(), response = await post({ full_name: 'Legacy fictif', phone: '+221000000003', property_id: id, email: '', unknown_old_field: true }, env(d.db));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true });
    expect(d.rows()).toHaveLength(1); expect(d.rows()[0]).toMatchObject({ property_id: id, property_reference: null, qualification_json: null, business_fingerprint: null, synced_at: null, sync_attempts: 0 });
  });

  it('stores once and acknowledges exact initial replay/recovery without another quota or insert', async () => {
    const d = database(), quota = vi.fn(allowed);
    expect(await acceptQualifiedLead(d.db, payload(), quota)).toEqual({ status: 'accepted', submissionId: id });
    const snapshot = d.rows();
    expect(await acceptQualifiedLead(d.db, payload(), quota)).toEqual({ status: 'replayed', submissionId: id });
    expect(await acceptQualifiedLead(d.db, payload({ delivery_mode: 'recover' }), quota)).toEqual({ status: 'replayed', submissionId: id });
    expect(d.rows()).toEqual(snapshot); expect(d.inserts()).toHaveLength(1); expect(quota).toHaveBeenCalledTimes(1);
  });

  it('uses real SQLite uniqueness for two overlapping initial requests with the same id and content', async () => {
    const d = database(), quota = twoCallerQuota();
    const results = await Promise.all([acceptQualifiedLead(d.db, payload(), quota), acceptQualifiedLead(d.db, payload(), quota)]);
    expect(results.map(result => result.status).sort()).toEqual(['accepted', 'replayed']); expect(d.rows()).toHaveLength(1);
    expect(d.inserts()).toHaveLength(2);
    expect(d.rows()[0].id).toBe(id); expect(d.rows()[0].qualification_json).toBe(JSON.stringify(payload().qualification));
  });

  it('allows only one winner for overlapping same-id different-content requests', async () => {
    const d = database(), quota = twoCallerQuota();
    const results = await Promise.all([acceptQualifiedLead(d.db, payload(), quota), acceptQualifiedLead(d.db, payload({ message: 'Different declared intent' }), quota)]);
    expect(results.map(result => result.status).sort()).toEqual(['accepted', 'conflict']); expect(d.rows()).toHaveLength(1);
    expect(d.inserts()).toHaveLength(2);
    const before = d.rows(); expect(await acceptQualifiedLead(d.db, payload({ full_name: 'Changed identity' }), allowed)).toEqual({ status: 'conflict' }); expect(d.rows()).toEqual(before);
  });

  it('recovers an exact committed row after the write reply and following verification read were lost', async () => {
    const d = database(); d.faults.loseLeadWriteAndNextRead = true;
    expect(await acceptQualifiedLead(d.db, payload(), allowed)).toEqual({ status: 'unavailable' }); expect(d.rows()).toHaveLength(1);
    const before = d.rows(), count = d.inserts().length;
    expect(await acceptQualifiedLead(d.db, payload({ delivery_mode: 'recover' }), () => { throw new Error('Recovery must not consume write quota'); })).toEqual({ status: 'replayed', submissionId: id });
    expect(d.rows()).toEqual(before); expect(d.inserts()).toHaveLength(count);
  });

  it('holds missing and purged recovery with zero INSERT and no new quota, without adding a retention ledger', async () => {
    const d = database(), quota = vi.fn(allowed);
    expect(await acceptQualifiedLead(d.db, payload({ delivery_mode: 'recover' }), quota)).toEqual({ status: 'unconfirmed' });
    expect(d.inserts()).toEqual([]); expect(quota).not.toHaveBeenCalled();
    await acceptQualifiedLead(d.db, payload(), allowed); d.sql.exec('DELETE FROM leads'); const inserts = d.inserts().length;
    expect(await acceptQualifiedLead(d.db, payload({ delivery_mode: 'recover' }), quota)).toEqual({ status: 'unconfirmed' });
    expect(d.rows()).toEqual([]); expect(d.inserts()).toHaveLength(inserts); expect(quota).not.toHaveBeenCalled();
  });

  it('does not treat a matching stored hash alone as proof after raw data drift', async () => {
    const d = database(); await acceptQualifiedLead(d.db, payload(), allowed);
    d.sql.prepare('UPDATE leads SET phone = ? WHERE id = ?').run('+221000000004', id); const before = d.rows();
    expect(await acceptQualifiedLead(d.db, payload({ delivery_mode: 'recover' }), allowed)).toEqual({ status: 'conflict' }); expect(d.rows()).toEqual(before);
  });

  it('never acknowledges an unsuccessful D1 write or exposes provider errors', async () => {
    const d = database(); d.faults.rejectInsert = true;
    expect(await acceptQualifiedLead(d.db, payload(), allowed)).toEqual({ status: 'unavailable' });
    expect(await insertLead(d.db, { full_name: 'Legacy fictif', phone: '+221000000003' })).toEqual({ ok: false, reason: 'write_failed' });
    expect(d.rows()).toEqual([]);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await post(payload(), env(d.db)); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Intake temporarily unavailable' });
    expect(warning).toHaveBeenCalledWith('[leads] intake unavailable', { reason: 'qualified_write_failed' });
  });

  it('caps actual streamed bytes with dishonest or absent Content-Length and rejects invalid UTF8', async () => {
    for (const headers of [{}, { 'content-length': '1' }]) {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8192)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
      const request = new Request('https://jammimmo.com/api/leads', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit);
      await expect(readBoundedRequestText(request, 8192)).rejects.toBeInstanceOf(PayloadTooLargeError); expect(cancelled).toBe(true);
    }
    const invalid = new Request('https://jammimmo.com/api/leads', { method: 'POST', body: new Uint8Array([0xc3, 0x28]) });
    await expect(readBoundedRequestText(invalid, 8192)).rejects.toBeInstanceOf(TypeError);
    expect(await readBoundedRequestText(new Request('https://jammimmo.com', { method: 'POST', body: 'x'.repeat(8192) }), 8192)).toHaveLength(8192);
  });

  it('requires exact approved browser origin and JSON type before touching SQL', async () => {
    const d = database();
    for (const origin of ['', 'https://evil.invalid', 'https://branch.jammimmo-vitrine.pages.dev', 'http://jammimmo.com', 'https://jammimmo.com:8443'])
      expect((await post(payload(), env(d.db), { origin })).status).toBe(403);
    expect((await post(payload(), env(d.db), { 'content-type': 'text/plain' })).status).toBe(415); expect(d.calls).toEqual([]);
    expect(isAllowedIntakeOrigin(null, 'https://jammimmo.com')).toBe(false);
    expect(isAllowedIntakeOrigin('https://jammimmo.com', 'https://jammimmo.com/path')).toBe(false);
    expect(isAllowedIntakeOrigin('http://127.0.0.1:4239', undefined, true)).toBe(true);
  });

  it('fails closed for absent/throwing/malformed burst limiter and missing salt or DB', async () => {
    const d = database();
    for (const binding of [undefined, { limit: async () => { throw new Error('provider detail'); } }, { limit: async () => ({ success: 'wrong' }) }])
      expect((await post(payload(), { ...env(d.db), LEAD_BURST_RL: binding })).status).toBe(503);
    expect((await post(payload(), { ...env(d.db), LEAD_BURST_RL: { limit: async () => ({ success: false }) } })).status).toBe(429);
    expect((await post(payload(), { ...env(d.db), INTAKE_IP_HASH_SALT: 'short' })).status).toBe(503);
    expect((await post(payload(), { ...env(d.db), INTAKE_DB: undefined })).status).toBe(503); expect(d.calls).toEqual([]);
    const hash = await hashClientIp('192.0.2.7', 'fictional-test-salt-no-secret'); expect(hash).toMatch(/^[a-f0-9]{32}$/); expect(hash).not.toContain('192.0.2.7');
  });

  it('does not downgrade malformed present qualification or spend hourly quota on invalid input', async () => {
    const d = database();
    for (const body of [{ ...payload(), qualification: undefined }, { ...payload(), qualification: null }, { ...payload(), delivery_mode: undefined }, { full_name: 'Legacy fictif', phone: '......' }])
      expect((await post(body, env(d.db))).status).toBe(422);
    const response = await post({ ...payload(), message: '😀'.repeat(2100) }, env(d.db), { 'content-length': '1' });
    expect(response.status).toBe(413); expect(d.calls).toEqual([]);
  });

  it('enforces an exact five-write hourly quota with real concurrent SQLite statements and window reset', async () => {
    const d = database();
    const results = await Promise.all(Array.from({ length: 6 }, () => consumeD1FixedWindow(d.db, 'lead-hour:abcdef1234', 5, 3600)));
    expect(results.filter(x => x === 'allowed')).toHaveLength(5); expect(results.filter(x => x === 'limited')).toHaveLength(1);
    d.sql.exec('UPDATE intake_rate_limits SET window_started_at = unixepoch() - 3600');
    expect(await consumeD1FixedWindow(d.db, 'lead-hour:abcdef1234', 5, 3600)).toBe('allowed');
    expect(d.sql.prepare('SELECT count FROM intake_rate_limits').get()?.count).toBe(1);
  });

  it('does not write leads when required quota schema is absent', async () => {
    const d = database(); d.sql.exec('DROP TABLE intake_rate_limits');
    expect((await post(payload(), env(d.db))).status).toBe(503); expect(d.rows()).toEqual([]); expect(d.inserts()).toEqual([]);
  });

  it('cleans at most100 counters older than24h on a valid POST while keeping recent and active quota intact', async () => {
    const d = database();
    const old = d.sql.prepare('INSERT INTO intake_rate_limits VALUES (?, unixepoch() - 86401, 5)');
    for (let index = 0; index < 105; index++) old.run('expired:' + String(index).padStart(3, '0'));
    d.sql.exec("INSERT INTO intake_rate_limits VALUES ('lead-hour:recent-counter', unixepoch() - 7200, 3), ('lead-hour:still-active', unixepoch(), 5)");
    const recent = d.sql.prepare("SELECT * FROM intake_rate_limits WHERE rate_key NOT LIKE 'expired:%' ORDER BY rate_key").all();
    expect((await post(payload(), env(d.db))).status).toBe(201);
    expect(d.sql.prepare("SELECT count(*) AS n FROM intake_rate_limits WHERE rate_key LIKE 'expired:%'").get()?.n).toBe(5);
    for (const row of recent) expect(d.sql.prepare('SELECT * FROM intake_rate_limits WHERE rate_key = ?').get(String(row.rate_key))).toEqual(row);
    const cleanup = d.calls.findIndex(call => call.query.startsWith('DELETE FROM intake_rate_limits'));
    const quota = d.calls.findIndex(call => call.query.startsWith('INSERT INTO intake_rate_limits'));
    expect(cleanup).toBeGreaterThanOrEqual(0); expect(quota).toBeGreaterThan(cleanup);
    expect(await consumeD1FixedWindow(d.db, 'lead-hour:still-active', 5, 3600)).toBe('limited');
  });

  it('keeps additive storage constraints, sync defaults and the original views schema', () => {
    const d = database();
    const columns = d.sql.prepare('PRAGMA table_info(property_views)').all().map(row => row.name);
    expect(columns).toEqual(['id', 'property_id', 'viewed_at', 'ip_hash', 'country', 'referrer']);
    const statement = d.sql.prepare('INSERT INTO leads (id, full_name, phone, qualification_json, business_fingerprint) VALUES (?, ?, ?, ?, ?)');
    for (const qualification of ['{}', '{"version":2}', '{"version":1.0}', '[]', 'not-json'])
      expect(() => statement.run(id, 'Fictif', '+221000000003', qualification, 'a'.repeat(64))).toThrow();
    expect(d.rows()).toEqual([]);
  });

  it('returns only exact qualified ACKs, conflict or an explicit unconfirmed hold through the real route', async () => {
    const d = database(), runtime = env(d.db), first = await post(payload(), runtime);
    expect(first.status).toBe(201); expect(await first.json()).toEqual({ ok: true, submission_id: id, qualification_version: 1 });
    const before = d.rows(), replay = await post(payload({ delivery_mode: 'recover' }), runtime);
    expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ ok: true, submission_id: id, qualification_version: 1 });
    const conflict = await post(payload({ message: 'changed' }), runtime); expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ ok: false, error: 'submission_conflict' });
    expect(d.rows()).toEqual(before);
    d.sql.exec('DELETE FROM leads'); const inserts = d.inserts().length;
    const hold = await post(payload({ delivery_mode: 'recover' }), runtime); expect(hold.status).toBe(202); expect(await hold.json()).toEqual({ ok: false, status: 'unconfirmed' });
    expect(d.inserts()).toHaveLength(inserts); expect(d.rows()).toEqual([]); expect(hold.headers.get('cache-control')).toBe('no-store');
  });
});
