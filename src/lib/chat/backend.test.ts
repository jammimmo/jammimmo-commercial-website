import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatTestDatabase } from './test-d1';
import { handleChat, type ChatAction } from './server';
import type { ChatConfig, ChatEnv, ChatFiles, ChatObject } from './types';
import { CHAT_SOURCES } from './sources';
import { digest } from './security';
import { PUBLIC_PROPERTY_FACTS } from './property-facts';

const origin = 'https://jammimmo.test';
const databases: ReturnType<typeof chatTestDatabase>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.sql.close(); });
type PublicResult = { csrf: string; conversation: { id: string; status: string; messages: unknown[]; receipt?: { id: string } }; message: { id: string; content: string }; receipt: { id: string }; id: string; state: string; error: string; policy: { files: { enabled: boolean; retentionHours: number } } };
function setup() {
  const fixture = chatTestDatabase(); databases.push(fixture);
  const settings = JSON.parse(String(fixture.sql.prepare("SELECT config_json FROM chat_settings WHERE id='global'").get()!.config_json)) as ChatConfig;
  settings.enabled = true;
  const configure = () => fixture.sql.prepare("UPDATE chat_settings SET config_json=? WHERE id='global'").run(JSON.stringify(settings));
  configure();
  const env: ChatEnv = { INTAKE_DB: fixture.db, CHAT_ALLOWED_ORIGINS: origin, CHAT_IP_HASH_SALT: 'test-only-not-a-secret-production-value' };
  const request = (action: ChatAction, method: string, body?: unknown, cookie = '', csrf = '') => handleChat(action,
    new Request(origin + '/api/chat/' + action, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', Cookie: cookie, 'X-Chat-CSRF': csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  const session = async () => { const response = await request('session', 'POST', {}); expect(response.status).toBe(200);
    return { body: await response.json() as PublicResult, cookie: response.headers.get('set-cookie')!.split(';')[0] }; };
  return { ...fixture, settings, configure, env, request, session };
}
function scanner(fixture: ReturnType<typeof setup>) {
  const now = new Date().toISOString();
  fixture.sql.prepare('INSERT INTO chat_scanners VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), 'test-public-key', 'active', 'ClamAV 1.4.0', now, now,
    new Date(Date.now() + 86400000).toISOString(), now, 'director-test', Math.floor(Date.now() / 1000));
  fixture.settings.files.enabled = true; fixture.configure(); fixture.env.CHAT_SCANNER_OPERATIONAL = 'true';
}
function files() {
  const objects = new Map<string, ChatObject>(); let loseAck = false;
  let beforePut: (() => Promise<void>) | undefined;
  const store: ChatFiles = {
    head: vi.fn(async key => objects.get(key) ?? null), delete: vi.fn(async key => { objects.delete(key); }),
    put: vi.fn(async (key, bytes, options) => {
      expect(options.onlyIf).toEqual({ etagDoesNotMatch: '*' });
      await beforePut?.(); if (objects.has(key)) return null;
      const object = { key, size: bytes.length, customMetadata: options.customMetadata }; objects.set(key, object);
      if (loseAck) { loseAck = false; throw new Error('ack lost after immutable create'); }
      return object;
    }),
  };
  return { store, objects, lostNextAck: () => { loseAck = true; }, block: (hook: () => Promise<void>) => { beforePut = hook; } };
}
const pdf = new TextEncoder().encode('%PDF-1.4\nplain local scanner fixture\n%%EOF');
async function reserve(f: ReturnType<typeof setup>, s: Awaited<ReturnType<ReturnType<typeof setup>['session']>>, requestId = crypto.randomUUID()) {
  return f.request('attachments', 'POST', { requestId, name: 'fixture.pdf', type: 'application/pdf', size: pdf.length }, s.cookie, s.body.csrf);
}
const upload = (f: ReturnType<typeof setup>, s: Awaited<ReturnType<ReturnType<typeof setup>['session']>>, id: string, bytes = pdf) => handleChat('upload', new Request(origin + '/api/chat/attachments/' + id,
  { method: 'PUT', body: bytes, headers: { Origin: origin, Cookie: s.cookie, 'X-Chat-CSRF': s.body.csrf, 'Content-Type': 'application/pdf' } }), f.env, id);

describe('public backend with actual local SQLite schema, no network', () => {
  it('serves sourced property prices, unicode references and new searches from the real message route without AI', async () => {
    const f = setup(), s = await f.session(); f.settings.aiEnabled = true; f.configure();
    f.env.AI = { run: vi.fn(async () => { throw new Error('facts must not call AI'); }) }; f.env.CHAT_AI_FREE_VERIFIED = 'true';
    const listing = PUBLIC_PROPERTY_FACTS.find(row => row.reference.includes('🔖'))!;
    const page = { path: new URL(listing.url).pathname, propertyReference: listing.reference, title: 'Untrusted browser title: price 1 FCFA' };
    const response = await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Quel prix pour ce bien ?', page }, s.cookie, s.body.csrf);
    expect(response.status).toBe(200);
    const result = await response.json() as PublicResult & { message: { citations: { id: string; url: string }[] } };
    expect(result.message.content).toContain('31/10/2026'); expect(result.message.content).not.toContain('Untrusted browser');
    expect(result.message.citations[0].url).toBe(listing.url);
    const search = await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Je cherche un appartement 3 chambres à Ngor', page }, s.cookie, s.body.csrf);
    const searched = await search.json() as PublicResult & { message: { citations: { id: string }[] } };
    expect(searched.message.citations[0].id).toMatch(/^search:/);
    expect(searched.message.content).not.toContain(listing.title);
    expect(f.env.AI.run).not.toHaveBeenCalled();
  });
  it('reopens operator work and notifies once when the visitor replies after waiting_visitor, including replay', async () => {
    const f = setup(), s = await f.session(); f.env.AI = { run: vi.fn() };
    await f.request('handoff', 'POST', { requestId: crypto.randomUUID(), name: 'Visiteur local', channel: 'chat', topic: 'property', summary: 'Relais local', consent: true }, s.cookie, s.body.csrf);
    f.sql.prepare("UPDATE chat_conversations SET status='waiting_visitor',assigned_to=? WHERE id=?").run(crypto.randomUUID(), s.body.conversation.id);
    const body = { requestId: crypto.randomUUID(), text: 'Voici ma réponse confidentielle' };
    const first = await f.request('message', 'POST', body, s.cookie, s.body.csrf);
    expect(first.status).toBe(200); expect((await first.json() as PublicResult).conversation.status).toBe('assigned');
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_events').get()!.n).toBe(2);
    const event = f.sql.prepare("SELECT * FROM chat_events WHERE dedupe_key LIKE 'visitor_reply:%'").get()!;
    expect(event.kind).toBe('handoff_notification'); expect(String(event.payload_json)).not.toContain('confidentielle');
    expect(event.status).toBe('unconfigured');
    const replay = await f.request('message', 'POST', body, s.cookie, s.body.csrf); expect(replay.status).toBe(200);
    await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Un deuxième complément' }, s.cookie, s.body.csrf);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_events').get()!.n).toBe(2);
    expect(f.sql.prepare("SELECT count(*) AS n FROM chat_messages WHERE role='assistant'").get()!.n).toBe(0);
    expect(f.env.AI.run).not.toHaveBeenCalled();
  });
  it('answers a general guide question from a property page while refusing to invent its availability', async () => {
    const f = setup(), s = await f.session();
    const page = { path: '/biens/ji-test-0001', propertyReference: 'JI-TEST-0001' };
    const guide = await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Comment vérifier un titre foncier ?', page }, s.cookie, s.body.csrf);
    expect(guide.status).toBe(200);
    const answer = await guide.json() as PublicResult & { message: { content: string; citations: { id: string }[] } };
    expect(answer.message.citations.some(citation => /^(guide|tool):/.test(citation.id))).toBe(true);
    expect(answer.message.content).not.toContain('Je ne dispose pas d’une lecture récente du catalogue');
    const stock = await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Ce bien est-il encore disponible ?', page }, s.cookie, s.body.csrf);
    expect(stock.status).toBe(200);
    expect((await stock.json() as PublicResult).message.content).toContain('notre équipe peut vérifier');
  });
  it('binds capability/CSRF, rejects foreign origin and scopes files to their conversation', async () => {
    const f = setup(), a = await f.session(), b = await f.session();
    expect((await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Bonjour' }, a.cookie, b.body.csrf)).status).toBe(403);
    expect((await handleChat('session', new Request(origin + '/api/chat/session', { method: 'POST', body: '{}', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } }), f.env)).status).toBe(403);
    expect(a.cookie).not.toBe(b.cookie);
    const r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f);
    const file = await (await reserve(f, a)).json() as PublicResult;
    expect((await upload(f, b, file.id)).status).toBe(404);
    expect(r2.store.put).not.toHaveBeenCalled();
  });
  it('independently rejects MIME/extension mismatches and bidi names before any R2 access, even on upload', async () => {
    const f = setup(), s = await f.session(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    for (const name of ['bad.exe', 'bad.pdf', 'photo\u202egnp.exe', 'photo\u2066.png']) {
      const result = await f.request('attachments', 'POST', { requestId: crypto.randomUUID(), name, type: 'image/png', size: png.length }, s.cookie, s.body.csrf);
      expect(result.status).toBe(400);
    }
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_attachments').get()!.n).toBe(0);
    const reserved = await f.request('attachments', 'POST', { requestId: crypto.randomUUID(), name: 'valid.PNG', type: 'image/png', size: png.length }, s.cookie, s.body.csrf);
    expect(reserved.status).toBe(200); const file = await reserved.json() as PublicResult;
    // Simulate an older/corrupted reservation: magic bytes alone are not enough.
    f.sql.prepare('UPDATE chat_attachments SET name=? WHERE id=?').run('bad.exe', file.id);
    const result = await handleChat('upload', new Request(origin + '/api/chat/attachments/' + file.id, { method: 'PUT', body: png,
      headers: { Origin: origin, Cookie: s.cookie, 'X-Chat-CSRF': s.body.csrf, 'Content-Type': 'image/png' } }), f.env, file.id);
    expect(result.status).toBe(415); expect(r2.store.head).not.toHaveBeenCalled(); expect(r2.store.put).not.toHaveBeenCalled();
  });
  it('reports quota occupancy for rejected and expired rows until actual deletion, without hiding old live rows', async () => {
    const f = setup(), s = await f.session(); f.env.CHAT_FILES = files().store; scanner(f);
    const active = await (await reserve(f, s)).json() as PublicResult;
    f.sql.prepare("UPDATE chat_attachments SET state='rejected',expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), active.id);
    for (let i = 0; i < 3; i++) { const old = await (await reserve(f, s)).json() as PublicResult; f.sql.prepare("UPDATE chat_attachments SET state='deleted' WHERE id=?").run(old.id); }
    const result = await (await f.request('conversation', 'GET', undefined, s.cookie)).json() as { attachments: Array<{ id: string; state: string; countsTowardsQuota: boolean }> };
    expect(result.attachments.find(file => file.id === active.id)).toMatchObject({ state: 'expired', countsTowardsQuota: true });
    expect(result.attachments.filter(file => file.id !== active.id).every(file => !file.countsTowardsQuota)).toBe(true);
    f.sql.prepare('UPDATE chat_attachments SET expires_at=? WHERE id=?').run(new Date(Date.now() + 3600_000).toISOString(), active.id);
    const rejected = await (await f.request('conversation', 'GET', undefined, s.cookie)).json() as typeof result;
    expect(rejected.attachments.find(file => file.id === active.id)).toMatchObject({ state: 'rejected', countsTowardsQuota: true });
  });
  it('restores durable files and quota occupancy in POST session without requiring a conversation fetch', async () => {
    const f = setup(), s = await f.session(); f.env.CHAT_FILES = files().store; scanner(f);
    const first = await (await reserve(f, s)).json() as PublicResult;
    const second = await (await reserve(f, s)).json() as PublicResult;
    f.sql.prepare("UPDATE chat_attachments SET state='rejected' WHERE id=?").run(first.id);
    f.sql.prepare('UPDATE chat_attachments SET expires_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), second.id);
    const restored = await f.request('session', 'POST', {}, s.cookie);
    expect(restored.status).toBe(200); expect(restored.headers.get('set-cookie')).toBeNull();
    const result = await restored.json() as PublicResult & { attachments: Array<{ id: string; name: string; type: string; size: number; state: string; countsTowardsQuota: boolean }> };
    expect(result.conversation.id).toBe(s.body.conversation.id); expect(result.csrf).toBe(s.body.csrf);
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments.find(file => file.id === first.id)).toMatchObject({ name: 'fixture.pdf', type: 'application/pdf', size: pdf.length, state: 'rejected', countsTowardsQuota: true });
    expect(result.attachments.find(file => file.id === second.id)).toMatchObject({ state: 'expired', countsTowardsQuota: true });
    expect(JSON.stringify(result.attachments)).not.toMatch(/object_key|sha256|chat\/quarantine/);
    expect(f.env.CHAT_FILES.head).not.toHaveBeenCalled();
  });
  it('keeps short session retention and file readiness truthful', async () => {
    const f = setup(); f.settings.retentionDays = 2; f.configure();
    const result = await f.request('session', 'POST', {}), body = await result.json() as PublicResult;
    expect(result.headers.get('set-cookie')).toMatch(/Secure; HttpOnly; SameSite=Strict; Path=\/; Max-Age=172800/);
    expect(body.policy.files.enabled).toBe(false); expect(body.policy.files.retentionHours).toBe(24);
    f.env.CHAT_FILES = files().store; scanner(f);
    f.sql.prepare("UPDATE chat_scanners SET signatures_at=?,last_seen_at=?").run(new Date(Date.now() + 120000).toISOString(), new Date().toISOString());
    const s = await f.session(); expect(s.body.policy.files.enabled).toBe(false);
  });
  it('bounds observed JSON bytes and text before admitting a message', async () => {
    const f = setup(), s = await f.session();
    const tooBig = await handleChat('message', new Request(origin + '/api/chat/message', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(9000) }),
      headers: { Origin: origin, Cookie: s.cookie, 'X-Chat-CSRF': s.body.csrf, 'Content-Type': 'application/json', 'Content-Length': '1' } }), f.env);
    expect(tooBig.status).toBe(413);
    expect((await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'x'.repeat(2001) }, s.cookie, s.body.csrf)).status).toBe(400);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_requests').get()!.n).toBe(0);
  });
  it('requires explicit consent to create a human relay and stops bot replies after relay', async () => {
    const f = setup(), s = await f.session(); f.env.AI = { run: vi.fn() };
    const message = await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Je veux parler à quelqu’un' }, s.cookie, s.body.csrf);
    expect((await message.json() as PublicResult).conversation.status).toBe('bot');
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_events').get()!.n).toBe(0);
    const body = { requestId: crypto.randomUUID(), name: 'Visiteur local', channel: 'chat', contact: '', topic: 'property', summary: 'Demande locale', consent: true };
    const first = await (await f.request('handoff', 'POST', body, s.cookie, s.body.csrf)).json() as PublicResult;
    const again = await (await f.request('handoff', 'POST', body, s.cookie, s.body.csrf)).json() as PublicResult;
    expect(first.conversation.status).toBe('waiting'); expect(again.receipt.id).toBe(first.receipt.id);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_events').get()!.n).toBe(1);
    await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Un complément pour le conseiller' }, s.cookie, s.body.csrf);
    expect(f.env.AI.run).not.toHaveBeenCalled();
    expect(f.sql.prepare("SELECT count(*) AS n FROM chat_messages WHERE role='assistant'").get()!.n).toBe(1);
    for (const row of f.sql.prepare('SELECT result_json FROM chat_requests').all()) expect(String(row.result_json)).not.toMatch(/conversation|Demande locale|messages/);
  });
  it('replays a completed message by immutable ID with current conversation, no second provider call', async () => {
    const f = setup(), s = await f.session(), source = CHAT_SOURCES.find(v => v.id === 'tool:fr:securite-fonciere:1')!;
    f.settings.aiEnabled = true; f.configure(); f.env.CHAT_AI_FREE_VERIFIED = 'true';
    f.env.AI = { run: vi.fn(async () => ({ response: JSON.stringify({ excerpts: [{ id: source.id, quote: source.text.slice(0, 200) }] }) })) };
    const body = { requestId: crypto.randomUUID(), text: 'Comment vérifier un titre foncier au Sénégal ?' };
    const first = await (await f.request('message', 'POST', body, s.cookie, s.body.csrf)).json() as PublicResult;
    f.sql.prepare("UPDATE chat_conversations SET status='waiting',version=version+1").run();
    const again = await (await f.request('message', 'POST', body, s.cookie, s.body.csrf)).json() as PublicResult;
    expect(first.message.id).toBe(again.message.id); expect(again.conversation.status).toBe('waiting');
    expect(f.env.AI.run).toHaveBeenCalledTimes(1);
    const stored = String(f.sql.prepare("SELECT result_json FROM chat_requests WHERE kind='message'").get()!.result_json);
    expect(stored.length).toBeLessThan(300); expect(stored).not.toMatch(/content|conversation|messages/);
    expect(f.sql.prepare("SELECT count(*) AS n FROM chat_messages WHERE role='visitor'").get()!.n).toBe(1);
  });
  it('does not call AI without exact verified-free gate and rejects invented model excerpts', async () => {
    const f = setup(), s = await f.session(); f.settings.aiEnabled = true; f.configure();
    f.env.AI = { run: vi.fn(async () => ({ response: '{"excerpts":[{"id":"tool:fr:securite-fonciere:1","quote":"invented factual answer and malicious link"}]}' })) };
    const question = 'Comment vérifier un titre foncier au Sénégal ?';
    await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: question }, s.cookie, s.body.csrf);
    expect(f.env.AI.run).not.toHaveBeenCalled();
    f.env.CHAT_AI_FREE_VERIFIED = 'true';
    const r = await (await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: question }, s.cookie, s.body.csrf)).json() as PublicResult;
    expect(f.env.AI.run).toHaveBeenCalledTimes(1); expect(r.message.content).not.toContain('invented');
    expect(r.message.content.length).toBeLessThanOrEqual(4000);
    expect(Number(f.sql.prepare("SELECT sum(count) AS n FROM chat_limits WHERE key LIKE 'ai:%'").get()!.n)).toBeGreaterThan(0);
  });
  it('releases an abandoned processing lock without recharging or resending its command', async () => {
    const f = setup(), s = await f.session(), id = crypto.randomUUID(), internal = crypto.randomUUID();
    f.settings.aiEnabled = true; f.configure(); f.env.AI = { run: vi.fn() };
    const hash = await digest(JSON.stringify({ text: 'old', page: { path: '/' } })), before = new Date(Date.now() - 121000).toISOString();
    f.sql.prepare("INSERT INTO chat_requests(id,conversation_id,request_id,kind,body_hash,created_at,updated_at) VALUES(?,?,?,'message',?,?,?)").run(internal, s.body.conversation.id, id, hash, before, before);
    f.sql.prepare("UPDATE chat_requests SET ai_state='reserved',ai_reserved_units=123 WHERE id=?").run(internal);
    const same = await f.request('message', 'POST', { requestId: id, text: 'old' }, s.cookie, s.body.csrf);
    expect(same.status).toBe(409);
    expect((await f.request('message', 'POST', { requestId: crypto.randomUUID(), text: 'Bonjour' }, s.cookie, s.body.csrf)).status).toBe(200);
    expect(f.sql.prepare('SELECT state,ai_state,ai_reserved_units FROM chat_requests WHERE id=?').get(internal)).toMatchObject({ state: 'uncertain', ai_state: 'unknown', ai_reserved_units: 123 });
    expect(Number(f.sql.prepare("SELECT sum(count) AS n FROM chat_limits WHERE key LIKE 'ai:%'").get()!.n)).toBe(123);
    expect(f.env.AI.run).not.toHaveBeenCalled();
  });
  it.each([{ count: 1, total: 1000 }, { count: 3, total: pdf.length }])('atomically enforces lower configured file limits: %o', async ({ count, total }) => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f);
    f.settings.files.maxCount = count; f.settings.files.totalBytes = total; f.configure();
    const s = await f.session(), responses = await Promise.all([reserve(f, s), reserve(f, s)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 429]);
    expect(f.sql.prepare('SELECT count(*) AS n,sum(size) AS bytes FROM chat_attachments').get()).toMatchObject({ n: 1, bytes: pdf.length });
  });
  it('keeps the configured per-file byte cap inside SQLite, independently of a stale policy read', async () => {
    const f = setup(), s = await f.session(), now = new Date().toISOString(); f.settings.files.maxBytes = pdf.length - 1; f.configure();
    await expect(f.db.prepare("INSERT INTO chat_attachments(id,conversation_id,request_id,name,content_type,size,state,object_key,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,'reserved',?,?,?,?)")
      .bind(crypto.randomUUID(), s.body.conversation.id, crypto.randomUUID(), 'a.pdf', 'application/pdf', pdf.length, 'chat/quarantine/test-only-key', now, now, new Date(Date.now() + 86400000).toISOString()).run())
      .rejects.toThrow('chat_attachment_bytes');
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_attachments').get()!.n).toBe(0);
  });
  it('atomically reserves the final daily storage bytes, without refund after scan failure or replay', async () => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f); const s = await f.session();
    const key = 'attachment:bytes:global:' + String(f.sql.prepare("SELECT date('now') AS day").get()!.day);
    f.sql.prepare('INSERT INTO chat_limits VALUES(?,?,?)').run(key, 104857600 - pdf.length, new Date(Date.now() + 172800000).toISOString());
    const ids = [crypto.randomUUID(), crypto.randomUUID()], results = await Promise.all(ids.map(id => reserve(f, s, id)));
    expect(results.map(r => r.status).sort()).toEqual([200, 429]);
    const winning = results.findIndex(r => r.status === 200), denied = await results.find(r => r.status === 429)!.json() as PublicResult;
    expect(denied.error).toBe('chat_file_daily_budget');
    f.sql.prepare("UPDATE chat_attachments SET state='scan_failed'").run();
    expect((await reserve(f, s, ids[winning])).status).toBe(200);
    expect(f.sql.prepare('SELECT count FROM chat_limits WHERE key=?').get(key)!.count).toBe(104857600);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_attachments').get()!.n).toBe(1);
  });
  it('atomically admits all request kinds and does not charge idempotent conflicts', async () => {
    const f = setup(), a = await f.session(), b = await f.session(), now = new Date().toISOString();
    const key = 'request:global:' + String(f.sql.prepare("SELECT date('now') AS day").get()!.day);
    f.sql.prepare('INSERT INTO chat_limits VALUES(?,?,?)').run(key, 7999, new Date(Date.now() + 172800000).toISOString());
    const insert = (conversation: string, kind: string) => f.db.prepare('INSERT OR IGNORE INTO chat_requests(id,conversation_id,request_id,kind,body_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), conversation, crypto.randomUUID(), kind, 'a'.repeat(64), now, now);
    const attempts = await Promise.allSettled([insert(a.body.conversation.id, 'handoff').run(), insert(b.body.conversation.id, 'attachment').run()]);
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.sql.prepare('SELECT count FROM chat_limits WHERE key=?').get(key)!.count).toBe(8000);
    const saved = f.sql.prepare('SELECT * FROM chat_requests').get()!;
    await f.db.prepare('INSERT OR IGNORE INTO chat_requests(id,conversation_id,request_id,kind,body_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), saved.conversation_id, saved.request_id, saved.kind, saved.body_hash, now, now).run();
    expect(f.sql.prepare('SELECT count FROM chat_limits WHERE key=?').get(key)!.count).toBe(8000);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_requests').get()!.n).toBe(1);
  });
  it('reserves the shared AI budget atomically and preserves the losing request', async () => {
    const f = setup(), a = await f.session(), b = await f.session(), now = new Date().toISOString();
    f.settings.aiEnabled = true; f.settings.dailyNeurons = 1; f.configure();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [index, s] of [a, b].entries()) f.sql.prepare("INSERT INTO chat_requests(id,conversation_id,request_id,kind,body_hash,created_at,updated_at) VALUES(?,?,?,'message',?,?,?)")
      .run(ids[index], s.body.conversation.id, crypto.randomUUID(), 'b'.repeat(64), now, now);
    const attempts = await Promise.allSettled(ids.map(id => f.db.prepare("UPDATE chat_requests SET ai_state='reserved',ai_reserved_units=1000 WHERE id=?").bind(id).run()));
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.sql.prepare("SELECT sum(count) AS n FROM chat_limits WHERE key LIKE 'ai:%'").get()!.n).toBe(1000);
    expect(f.sql.prepare("SELECT count(*) AS n FROM chat_requests WHERE ai_state='not_reserved'").get()!.n).toBe(1);
  });
  it('reconciles a lost PUT acknowledgement and never overwrites the same object', async () => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f); const s = await f.session();
    const file = await (await reserve(f, s)).json() as PublicResult; r2.lostNextAck();
    expect((await upload(f, s, file.id)).status).toBe(200);
    expect((await upload(f, s, file.id)).status).toBe(200);
    expect(r2.store.put).toHaveBeenCalledTimes(1); expect(r2.objects.size).toBe(1);
    expect(f.sql.prepare('SELECT state,sha256,actual_size FROM chat_attachments WHERE id=?').get(file.id)).toMatchObject({ state: 'quarantined', sha256: await digest(pdf), actual_size: pdf.length });
  });
  it('rejects encrypted PDF before R2 and normalizes internal scan states in public DTOs', async () => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f); const s = await f.session();
    const file = await (await reserve(f, s)).json() as PublicResult;
    expect(file.state).toBe('uploading');
    const encrypted = pdf.slice(); encrypted.set(new TextEncoder().encode('/Encrypt '), 9);
    expect((await upload(f, s, file.id, encrypted)).status).toBe(415); expect(r2.store.put).not.toHaveBeenCalled();
    f.sql.prepare("UPDATE chat_attachments SET state='scan_failed' WHERE id=?").run(file.id);
    const failed = await (await f.request('conversation', 'GET', undefined, s.cookie)).json() as { attachments: Array<{ state: string }> };
    expect(failed.attachments[0].state).toBe('scan_error');
    f.sql.prepare("UPDATE chat_attachments SET state='deleted' WHERE id=?").run(file.id);
    const expired = await (await f.request('conversation', 'GET', undefined, s.cookie)).json() as { attachments: Array<{ state: string }> };
    expect(expired.attachments[0].state).toBe('expired');
  });
  it('reconciles an existing uploading object after worker loss and rejects concurrent different bytes', async () => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f); const s = await f.session();
    const file = await (await reserve(f, s)).json() as PublicResult, hash = await digest(pdf);
    const key = String(f.sql.prepare('SELECT object_key FROM chat_attachments WHERE id=?').get(file.id)!.object_key);
    f.sql.prepare("UPDATE chat_attachments SET state='uploading',sha256=?,actual_size=? WHERE id=?").run(hash, pdf.length, file.id);
    r2.objects.set(key, { key, size: pdf.length, customMetadata: { sha256: hash, conversationId: s.body.conversation.id, attachmentId: file.id } });
    const changed = pdf.slice(); changed[15] = changed[15] === 65 ? 66 : 65;
    const attempts = await Promise.all([upload(f, s, file.id), upload(f, s, file.id, changed)]);
    expect(attempts.map(r => r.status).sort()).toEqual([200, 409]); expect(r2.store.put).not.toHaveBeenCalled();
    expect(r2.objects.get(key)!.customMetadata!.sha256).toBe(hash);
  });
  it('does not leave an orphan when clearing a conversation while PUT is in flight', async () => {
    const f = setup(), r2 = files(); f.env.CHAT_FILES = r2.store; scanner(f); const s = await f.session();
    const file = await (await reserve(f, s)).json() as PublicResult;
    let started!: () => void, release!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; }); r2.block(async () => { started(); await gate; });
    const putting = upload(f, s, file.id); await began;
    expect((await f.request('session', 'DELETE', {}, s.cookie, s.body.csrf)).status).toBe(200);
    release(); expect((await putting).status).toBe(410); expect(r2.objects.size).toBe(0);
    expect(f.sql.prepare('SELECT count(*) AS n FROM chat_sessions').get()!.n).toBe(0);
  });
});
