import type { ChatConfig, ChatDatabase, ChatEnv, ChatRequest, ChatResult, Conversation, Session } from './types';
import { cookie, digest, fail, iso, readCapability, record, UUID } from './security';
import { publicCitations } from './sources';
export function database(env: ChatEnv) { if (!env.INTAKE_DB?.batch) fail('chat_unavailable', 503); return env.INTAKE_DB; }
export async function all<T>(db: ChatDatabase, sql: string, ...args: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...args).all<T>(); if (!result.success || !Array.isArray(result.results)) fail('chat_unavailable', 503); return result.results;
}
export async function batch(db: ChatDatabase, statements: ReturnType<ChatDatabase['prepare']>[]) {
  const result = await db.batch(statements); if (!Array.isArray(result) || result.length !== statements.length || result.some(v => !v.success)) fail('chat_unavailable', 503); return result;
}
export async function config(db: ChatDatabase): Promise<ChatConfig> {
  const row = await db.prepare("SELECT config_json FROM chat_settings WHERE id='global'").first<{ config_json: string }>();
  let value: unknown; try { value = JSON.parse(row?.config_json ?? 'null'); } catch { fail('chat_configuration_unavailable', 503); }
  if (!record(value) || typeof value.enabled !== 'boolean' || typeof value.welcome !== 'string' || value.welcome.length > 500
    || !record(value.files) || typeof value.files.enabled !== 'boolean'
    || !Number.isInteger(value.files.maxCount) || Number(value.files.maxCount) < 1 || Number(value.files.maxCount) > 3
    || !Number.isInteger(value.files.maxBytes) || Number(value.files.maxBytes) < 1 || Number(value.files.maxBytes) > 5242880
    || !Number.isInteger(value.files.totalBytes) || Number(value.files.totalBytes) < 1 || Number(value.files.totalBytes) > 15728640
    || !Array.isArray(value.operatorIds) || value.operatorIds.length > 50 || value.operatorIds.some(id => typeof id !== 'string' || !UUID.test(id))
    || !Array.isArray(value.sourceIds) || value.sourceIds.length > 1000 || value.sourceIds.some(id => typeof id !== 'string' || !/^[a-z0-9:-]{3,160}$/.test(id))
    || typeof value.aiEnabled !== 'boolean' || typeof value.notificationEmailEnabled !== 'boolean'
    || !Number.isInteger(value.retentionDays) || Number(value.retentionDays) < 1 || Number(value.retentionDays) > 30
    || !Number.isInteger(value.dailyNeurons) || Number(value.dailyNeurons) < 0 || Number(value.dailyNeurons) > 8000) fail('chat_configuration_unavailable', 503);
  return value as unknown as ChatConfig;
}
export async function session(db: ChatDatabase, request: Request): Promise<{ session: Session; token: string }> {
  const token = readCapability(request); if (!token) fail('chat_session_required', 401);
  const row = await db.prepare('SELECT id,cap_hash,expires_at FROM chat_sessions WHERE cap_hash=? AND expires_at>?').bind(await digest(token), iso()).first<Session>();
  if (!row) fail('chat_session_expired', 401); return { session: row, token };
}
export async function ownedConversation(db: ChatDatabase, id: string): Promise<Conversation> {
  const row = await db.prepare('SELECT id,session_id,status,version,receipt_id,inbox_available_at,assigned_to,expires_at FROM chat_conversations WHERE session_id=? AND expires_at>?').bind(id, iso()).first<Conversation>();
  if (!row) fail('chat_conversation_unavailable', 410); return row;
}
export async function publicConversation(db: ChatDatabase, conversation: Conversation) {
  const messages = await all<{ id: string; role: string; content: string; citations_json: string; created_at: string }>(db,
    'SELECT id,role,content,citations_json,created_at FROM chat_messages WHERE conversation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 60', conversation.id);
  return { id: conversation.id, status: conversation.status, version: conversation.version,
    messages: messages.reverse().map(({ citations_json, ...m }) => ({ ...m, citations: publicCitations(citations_json) })),
    ...(conversation.receipt_id ? { receipt: await receipt(db, conversation) } : {}) };
}
export async function receipt(db: ChatDatabase, c: Conversation) {
  const event = await db.prepare("SELECT status FROM chat_events WHERE dedupe_key=? AND conversation_id=?").bind('handoff:' + c.receipt_id, c.id).first<{ status: string }>();
  const state = c.assigned_to ? 'claimed' : c.inbox_available_at ? 'available' : 'recorded';
  const raw = event?.status ?? 'unknown'; const notification = ['sent', 'failed', 'unknown', 'unconfigured'].includes(raw) ? raw : 'pending';
  return { id: c.receipt_id, state, notification };
}
export async function beginRequest(db: ChatDatabase, c: Conversation, requestId: string, kind: string, body: unknown) {
  const hash = await digest(JSON.stringify(body)); const id = crypto.randomUUID(), now = iso();
  if (kind === 'message') {
    // A vanished worker must not hold the conversation forever. Preserve its
    // uncertain command and charged ledger; neither the same UUID nor a late
    // provider response may silently restart or complete it.
    const expired = await db.prepare("UPDATE chat_requests SET state='uncertain',ai_state=CASE WHEN ai_state='reserved' THEN 'unknown' ELSE ai_state END,updated_at=? WHERE conversation_id=? AND kind='message' AND state='processing' AND created_at<?")
      .bind(now, c.id, new Date(Date.now() - 120_000).toISOString()).run();
    if (!expired.success) fail('chat_unavailable', 503);
  }
  try { const inserted = await db.prepare("INSERT OR IGNORE INTO chat_requests(id,conversation_id,request_id,kind,body_hash,created_at,updated_at) SELECT ?,id,?,?,?,?,? FROM chat_conversations WHERE id=? AND status<>'closed' AND expires_at>?")
    .bind(id, requestId, kind, hash, now, now, c.id, now).run(); if (!inserted.success) fail('chat_unavailable', 503); }
  catch (error) { if (error instanceof Response) throw error;
    if (String(error).includes('chat_message_limit') || String(error).includes('chat_thread_limit') || String(error).includes('chat_request_limit')) fail('chat_admission_rejected', 429);
    fail('chat_unavailable', 503);
  }
  const row = await db.prepare('SELECT * FROM chat_requests WHERE conversation_id=? AND request_id=?').bind(c.id, requestId).first<ChatRequest>();
  if (!row) fail('chat_request_in_progress', 409);
  if (row.kind !== kind || row.body_hash !== hash) fail('chat_request_conflict', 409);
  if (row.id !== id) {
    if (row.state === 'complete' && row.result_json) return { request: row, replay: JSON.parse(row.result_json) as unknown };
    // These operations have their own durable resource receipt. Reconcile it
    // after an acknowledgement loss; never repeat an AI call this way.
    if (row.state === 'processing' && (kind === 'handoff' || kind === 'attachment')) return { request: row, replay: null, recovering: true };
    if (row.state === 'processing' && Date.parse(row.created_at) < Date.now() - 120_000) {
      await db.prepare("UPDATE chat_requests SET state='uncertain',updated_at=? WHERE id=? AND state='processing'").bind(iso(), row.id).run();
    }
    fail('chat_request_' + (row.state === 'processing' ? 'in_progress' : 'unknown'), 409);
  }
  return { request: row, replay: null, recovering: false };
}
export async function completeRequest(db: ChatDatabase, request: ChatRequest, value: ChatResult) {
  const result = await db.prepare("UPDATE chat_requests SET state='complete',result_json=?,updated_at=? WHERE id=? AND state='processing'").bind(JSON.stringify(value), iso(), request.id).run();
  if (!result.success || result.meta?.changes !== 1) fail('chat_result_unknown', 503);
}
export const removeCookie = () => cookie('', true);
