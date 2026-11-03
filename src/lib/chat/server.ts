import { SITE } from '../site-config';
import type { ChatConfig, ChatEnv, Conversation, Attachment, ChatDatabase, ChatObject } from './types';
import { FILE_TYPES, MAX_FILE, MAX_FILES, MAX_TOTAL } from './types';
import { all, batch, beginRequest, completeRequest, config, database, ownedConversation, publicConversation, receipt, session } from './db';
import { boundedBytes, capability, cookie, csrfCheck, digest, expires, fail, iso, jsonBody, networkHash, originCheck, record, response, text, UUID } from './security';
import { language, publicCitations, retrieve, wantsHuman } from './sources';
import { answer } from './answer';
import { contextualQuestion, elliptical, requestsListingFacts } from './context';
import { catalogue, propertySearch } from './navigation';
import { propertyFactAnswer } from './property-facts';
import { safePropertyReference } from '../public-catalogue';

export type ChatAction = 'session' | 'conversation' | 'message' | 'handoff' | 'attachments' | 'upload';
function requestId(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value)) fail('chat_request_id_required'); return value.toLowerCase(); }
function page(value: unknown) {
  if (value === undefined) return { path: '/' };
  if (!record(value)) fail('chat_invalid_page');
  const path = text(value.path, 240);
  if (!path.startsWith('/') || path.includes('//') || /[?#\\\u0000-\u001f]/.test(path) || path.includes('..')) fail('chat_invalid_page');
  const reference = value.propertyReference === undefined ? undefined : text(value.propertyReference, 100);
  if (reference && !safePropertyReference(reference)) fail('chat_invalid_reference');
  return { path, ...(value.title === undefined ? {} : { title: text(value.title, 200) }), ...(reference ? { propertyReference: reference } : {}) };
}
async function scannerReady(db: ChatDatabase, env: ChatEnv) {
  if (!env.CHAT_FILES || env.CHAT_SCANNER_OPERATIONAL !== 'true') return false;
  const now = Date.now(), future = new Date(now + 60_000).toISOString();
  const row = await db.prepare("SELECT id,engine_version FROM chat_scanners WHERE status='active' AND expires_at>? AND last_seen_at>? AND last_seen_at<=? AND signatures_at>? AND signatures_at<=? LIMIT 1")
    .bind(new Date(now).toISOString(), new Date(now - 300_000).toISOString(), future, new Date(now - 48 * 3600_000).toISOString(), future).first<{ id: string; engine_version: string }>();
  return !!row && /^ClamAV \d+\.\d+\.\d+(?:[ /].{1,100})?$/.test(row.engine_version);
}
async function filesPolicy(db: ChatDatabase, env: ChatEnv, settings: ChatConfig) {
  return { enabled: settings.enabled && settings.files.enabled && await scannerReady(db, env), maxCount: Math.min(MAX_FILES, settings.files.maxCount),
    maxBytes: Math.min(MAX_FILE, settings.files.maxBytes), totalBytes: Math.min(MAX_TOTAL, settings.files.totalBytes), types: [...FILE_TYPES], retentionHours: 24 };
}
const contacts = () => ({ whatsapp: SITE.whatsappUrl, url: 'https://jammimmo.com/contact/', email: SITE.email });
async function current(db: ChatDatabase, sessionId: string) { return publicConversation(db, await ownedConversation(db, sessionId)); }
function publicFileState(state: string, expiry?: string) {
  if (state === 'deleted' || (expiry && expiry <= iso())) return 'expired';
  if (state === 'reserved') return 'uploading';
  if (state === 'scan_failed') return 'scan_error';
  return ['uploading', 'quarantined', 'scanning', 'clean', 'rejected'].includes(state) ? state : 'scan_error';
}
async function attachments(db: ChatDatabase, c: Conversation) {
  // Every nondeleted row still consumes the SQL count/byte quota, including
  // rejected or expired rows awaiting cleanup. Show these before old deleted
  // history so a bounded DTO cannot hide a quota-consuming attachment.
  const rows = await all<Attachment>(db, "SELECT id,name,content_type,size,state,expires_at FROM chat_attachments WHERE conversation_id=? ORDER BY CASE WHEN state='deleted' THEN 1 ELSE 0 END,created_at DESC,rowid DESC LIMIT 3", c.id);
  return rows.reverse().map(a => ({ id: a.id, name: a.name, type: a.content_type, size: a.size, state: publicFileState(a.state, a.expires_at), countsTowardsQuota: a.state !== 'deleted' }));
}
async function replayResult(db: ChatDatabase, c: Conversation, kind: 'message' | 'handoff' | 'attachment', stored: unknown) {
  if (!record(stored) || stored.kind !== kind) fail('chat_result_unavailable', 503);
  if (kind === 'attachment') {
    if (typeof stored.attachmentId !== 'string' || !UUID.test(stored.attachmentId)) fail('chat_result_unavailable', 503);
    const file = await db.prepare('SELECT id,state,expires_at FROM chat_attachments WHERE id=? AND conversation_id=?').bind(stored.attachmentId, c.id).first<{ id: string; state: string; expires_at: string }>();
    if (!file) fail('chat_result_unavailable', 410);
    return response({ id: file.id, state: publicFileState(file.state, file.expires_at), uploadUrl: '/api/chat/attachments/' + file.id });
  }
  const live = await ownedConversation(db, c.session_id), conversation = await publicConversation(db, live);
  if (kind === 'handoff') {
    if (!live.receipt_id || stored.receiptId !== live.receipt_id) fail('chat_result_unavailable', 503);
    return response({ conversation, receipt: await receipt(db, live) });
  }
  if (typeof stored.messageId !== 'string' || !UUID.test(stored.messageId) || !['sources', 'ai', 'human'].includes(String(stored.mode)) || typeof stored.handoffSuggested !== 'boolean') fail('chat_result_unavailable', 503);
  const message = await db.prepare('SELECT id,role,content,citations_json,created_at FROM chat_messages WHERE id=? AND conversation_id=?').bind(stored.messageId, c.id)
    .first<{ id: string; role: string; content: string; citations_json: string; created_at: string }>();
  if (!message) fail('chat_result_unavailable', 410);
  const { citations_json, ...fields } = message;
  return response({ conversation, message: { ...fields, citations: publicCitations(citations_json) }, mode: live.status === 'bot' ? stored.mode : 'human', handoffSuggested: stored.handoffSuggested });
}
async function bootstrap(db: ChatDatabase, request: Request, env: ChatEnv, settings: ChatConfig) {
  const body = await jsonBody(request, 64); if (Object.keys(body).length) fail('chat_invalid_body');
  let token: string, id: string, setCookie: string | undefined;
  try { const existing = await session(db, request); token = existing.token; id = existing.session.id; }
  catch (error) {
    if (!(error instanceof Response) || error.status !== 401) throw error;
    token = capability(); id = crypto.randomUUID(); const now = iso(), conversationId = crypto.randomUUID(), sessionSeconds = Math.min(7, settings.retentionDays) * 86400;
    try { await batch(db, [db.prepare('INSERT INTO chat_sessions(id,cap_hash,network_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
      .bind(id, await digest(token), await networkHash(request, env), expires(sessionSeconds * 1000), now),
    db.prepare('INSERT INTO chat_conversations(id,session_id,created_at,updated_at,expires_at) VALUES(?,?,?,?,?)')
      .bind(conversationId, id, now, now, expires(settings.retentionDays * 86400_000))]); }
    catch (e) { if (e instanceof Response) throw e; fail('chat_session_admission_rejected', 429); }
    setCookie = cookie(token, false, sessionSeconds);
  }
  const live = await ownedConversation(db, id);
  return response({ csrf: await digest(token + ':csrf:v1'), conversation: await publicConversation(db, live), attachments: await attachments(db, live),
    policy: { enabled: settings.enabled, welcome: settings.welcome, files: await filesPolicy(db, env, settings), retentionDays: settings.retentionDays }, contacts: contacts() },
  200, setCookie ? { 'Set-Cookie': setCookie } : {});
}
async function sendMessage(db: ChatDatabase, request: Request, env: ChatEnv, settings: ChatConfig, c: Conversation) {
  const body = await jsonBody(request), id = requestId(body.requestId), input = text(body.text, 2000), context = page(body.page);
  const attempt = await beginRequest(db, c, id, 'message', { text: input, page: context }); if (attempt.replay !== null) return replayResult(db, c, 'message', attempt.replay);
  if (c.status === 'closed') fail('chat_conversation_closed', 409);
  const visitorId = crypto.randomUUID(), createdAt = iso();
  const inserted = await batch(db, [db.prepare("INSERT INTO chat_messages(id,conversation_id,request_id,role,content,created_at) SELECT ?,id,?,'visitor',?,? FROM chat_conversations WHERE id=? AND status<>'closed'")
    .bind(visitorId, id, input, createdAt, c.id),
  // Re-notify only the first visitor reply after an operator response. The
  // state guard is read in this atomic batch, not from the stale JS snapshot.
  // No visitor text/contact enters the notification payload.
  db.prepare("INSERT INTO chat_events(id,conversation_id,request_id,kind,payload_json,status,dedupe_key,recipient_id,created_at,updated_at) SELECT ?,id,?,'handoff_notification',json_object('receiptId',receipt_id,'topic',topic),?,?,assigned_to,?,? FROM chat_conversations WHERE id=? AND status='waiting_visitor' AND assigned_to IS NOT NULL AND receipt_id IS NOT NULL AND EXISTS(SELECT 1 FROM chat_messages WHERE id=? AND conversation_id=chat_conversations.id)")
    .bind(crypto.randomUUID(), id, settings.notificationEmailEnabled && settings.operatorIds.length ? 'pending' : 'unconfigured', 'visitor_reply:' + visitorId, createdAt, createdAt, c.id, visitorId),
  db.prepare("UPDATE chat_conversations SET status=CASE WHEN status='waiting_visitor' THEN 'assigned' ELSE status END,version=version+1,updated_at=? WHERE id=? AND status<>'closed'").bind(createdAt, c.id)]);
  if (inserted[0].meta?.changes !== 1) fail('chat_conversation_closed', 409);
  const live = await ownedConversation(db, c.session_id);
  let result: { content: string; citations: import('./types').Citation[]; mode: 'sources' | 'ai' | 'human' };
  if (live.status !== 'bot') {
    // Visitor message belongs in the human thread. Never create an automatic
    // assistant reply next to an operator response or start another AI call.
    const value = { conversation: await current(db, c.session_id), message: { id: visitorId, role: 'visitor', content: input, citations: [], created_at: createdAt }, mode: 'human' };
    await completeRequest(db, attempt.request, { kind: 'message', messageId: visitorId, mode: 'human', handoffSuggested: false }); return response(value);
  }
  const human = wantsHuman(input);
  const greeting = /^(?:bonjour|salut|bonsoir|hello|hi|salam(?:\s+(?:a|alai|ali)[a-z ]*)?)[\s!?.]*$/i.test(input);
  const needsCatalogue = requestsListingFacts(input, !!context.propertyReference);
  const recent = elliptical(input) ? await all<{ content: string }>(db,
    "SELECT content FROM chat_messages WHERE conversation_id=? AND role='visitor' AND id<>? ORDER BY created_at DESC,rowid DESC LIMIT 3", c.id, visitorId) : [];
  const question = contextualQuestion(input, recent.map(item => item.content)), lang = language(context.path);
  const facts = human || greeting ? null : propertyFactAnswer(question, input, context, lang, settings.sourceIds);
  const search = propertySearch(question, input, lang);
  result = human ? { content: 'Vous pouvez demander un conseiller avec le bouton « Parler à un conseiller ». Choisissez le canal et confirmez les informations que vous souhaitez transmettre.', citations: [], mode: 'human' }
    : greeting ? { content: 'Bonjour ! Achat, location, gestion ou question sur nos outils : que recherchez-vous ?', citations: [], mode: 'sources' }
    : facts ? facts
    : search ? { content: `Avec plaisir. Voici une recherche préparée à partir de vos critères : ${search.quote}\n\nConsultez les résultats sur le site ; notre équipe pourra confirmer la disponibilité.`, citations: [search], mode: 'sources' }
    : needsCatalogue ? { content: 'Je ne dispose pas d’une lecture récente du catalogue pour confirmer cette référence, son prix ou sa disponibilité. Voici le catalogue public ; notre équipe peut vérifier le bien concerné.', citations: [catalogue(lang)], mode: 'sources' }
    : await answer(env, db, attempt.request, settings, question, retrieve(question, lang, settings.sourceIds, input));
  if (result.content.length > 4000) fail('chat_answer_invalid', 503);
  const messageId = crypto.randomUUID(), at = iso();
  const saved = await batch(db, [db.prepare("INSERT INTO chat_messages(id,conversation_id,request_id,role,content,citations_json,created_at) SELECT ?,id,?,'assistant',?,?,? FROM chat_conversations WHERE id=? AND status='bot' AND EXISTS(SELECT 1 FROM chat_requests WHERE id=? AND state='processing')")
    .bind(messageId, id, result.content, JSON.stringify(result.citations), at, c.id, attempt.request.id),
  db.prepare("UPDATE chat_conversations SET version=version+1,updated_at=? WHERE id=? AND status='bot' AND EXISTS(SELECT 1 FROM chat_messages WHERE id=?)").bind(at, c.id, messageId)]);
  const updated = await current(db, c.session_id);
  const message = saved[0].meta?.changes === 1 ? { id: messageId, role: 'assistant', content: result.content, citations: result.citations, created_at: at }
    : { id: visitorId, role: 'visitor', content: input, citations: [], created_at: createdAt };
  const value = { conversation: updated, message, mode: updated.status === 'bot' ? result.mode : 'human', handoffSuggested: human || (facts ? facts.handoffSuggested : needsCatalogue) || (!greeting && result.citations.length === 0) };
  await completeRequest(db, attempt.request, { kind: 'message', messageId: message.id, mode: value.mode as 'sources' | 'ai' | 'human', handoffSuggested: value.handoffSuggested }); return response(value);
}
async function handoff(db: ChatDatabase, request: Request, settings: ChatConfig, c: Conversation) {
  const body = await jsonBody(request), id = requestId(body.requestId), name = text(body.name, 120), summary = text(body.summary, 2000);
  if (!['email', 'phone', 'chat'].includes(String(body.channel)) || !['property', 'tools', 'services', 'other'].includes(String(body.topic)) || body.consent !== true) fail('chat_handoff_invalid');
  const channel = String(body.channel), topic = String(body.topic), contact = channel === 'chat' ? '' : text(body.contact, 254);
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) fail('chat_email_invalid');
  if (channel === 'phone' && (!/^\+?[0-9\s().-]+$/.test(contact) || contact.replace(/\D/g, '').length < 7 || contact.replace(/\D/g, '').length > 15)) fail('chat_phone_invalid');
  const attempt = await beginRequest(db, c, id, 'handoff', { name, channel, contact, summary, topic, consent: true }); if (attempt.replay !== null) return replayResult(db, c, 'handoff', attempt.replay);
  if (c.status === 'closed') fail('chat_conversation_closed', 409);
  if (attempt.recovering) {
    const existing = await ownedConversation(db, c.session_id);
    if (!existing.receipt_id) fail('chat_handoff_in_progress', 409);
    const value = { conversation: await publicConversation(db, existing), receipt: await receipt(db, existing) };
    await completeRequest(db, attempt.request, { kind: 'handoff', receiptId: existing.receipt_id }); return response(value);
  }
  if (!c.receipt_id) {
    const receiptId = crypto.randomUUID(), now = iso();
    await batch(db, [db.prepare("UPDATE chat_conversations SET status='waiting',version=version+1,name=?,channel=?,contact=?,summary=?,topic=?,consented_at=?,receipt_id=?,updated_at=? WHERE id=? AND receipt_id IS NULL AND status='bot'")
      .bind(name, channel, contact || null, summary, topic, now, receiptId, now, c.id),
    db.prepare("INSERT INTO chat_events(id,conversation_id,request_id,kind,payload_json,status,dedupe_key,created_at,updated_at) SELECT ?,id,?,'handoff_notification',?,?,?, ?,? FROM chat_conversations WHERE id=? AND receipt_id=?")
      .bind(crypto.randomUUID(), id, JSON.stringify({ receiptId, topic }), settings.notificationEmailEnabled && settings.operatorIds.length ? 'pending' : 'unconfigured', 'handoff:' + receiptId, now, now, c.id, receiptId)]);
  }
  const updated = await ownedConversation(db, c.session_id); if (!updated.receipt_id) fail('chat_handoff_unconfirmed', 409);
  const value = { conversation: await publicConversation(db, updated), receipt: await receipt(db, updated) };
  await completeRequest(db, attempt.request, { kind: 'handoff', receiptId: updated.receipt_id }); return response(value);
}
function signature(bytes: Uint8Array, type: string) {
  const ascii = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
  return type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    : type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
    : type === 'application/pdf' && ascii(0, 5) === '%PDF-' && !/\/Encrypt\b/.test(new TextDecoder('latin1').decode(bytes));
}
function validFileName(name: string, type: string): boolean {
  if (/[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/.test(name)) return false;
  const suffix = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return type === 'image/jpeg' ? suffix === 'jpg' || suffix === 'jpeg'
    : type === 'image/png' ? suffix === 'png' : type === 'image/webp' ? suffix === 'webp'
      : type === 'application/pdf' && suffix === 'pdf';
}
async function reserveFile(db: ChatDatabase, request: Request, env: ChatEnv, settings: ChatConfig, c: Conversation) {
  const policy = await filesPolicy(db, env, settings); if (!policy.enabled) fail('chat_files_unavailable', 503);
  const body = await jsonBody(request), id = requestId(body.requestId), name = text(body.name, 180), type = text(body.type, 80), size = body.size;
  if (!FILE_TYPES.includes(type as typeof FILE_TYPES[number]) || !Number.isInteger(size) || Number(size) <= 0 || Number(size) > policy.maxBytes || !validFileName(name, type)) fail('chat_file_invalid');
  const attempt = await beginRequest(db, c, id, 'attachment', { name, type, size }); if (attempt.replay !== null) return replayResult(db, c, 'attachment', attempt.replay);
  if (attempt.recovering) {
    const existing = await db.prepare('SELECT id,state,expires_at FROM chat_attachments WHERE conversation_id=? AND request_id=?').bind(c.id, id).first<{ id: string; state: string; expires_at: string }>();
    if (!existing) fail('chat_file_reservation_in_progress', 409);
    const value = { id: existing.id, state: publicFileState(existing.state, existing.expires_at), uploadUrl: '/api/chat/attachments/' + existing.id };
    await completeRequest(db, attempt.request, { kind: 'attachment', attachmentId: existing.id }); return response(value);
  }
  if (c.status === 'closed') fail('chat_conversation_closed', 409);
  const attachmentId = crypto.randomUUID(), now = iso();
  const value = { id: attachmentId, state: 'uploading', uploadUrl: '/api/chat/attachments/' + attachmentId };
  try { await batch(db, [db.prepare("INSERT INTO chat_attachments(id,conversation_id,request_id,name,content_type,size,state,object_key,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,'reserved',?,?,?,?)")
    .bind(attachmentId, c.id, id, name, type, size, `chat/quarantine/${c.id}/${attachmentId}`, now, now, c.expires_at < expires(86400_000) ? c.expires_at : expires(86400_000)),
  db.prepare("UPDATE chat_requests SET state='complete',result_json=?,updated_at=? WHERE id=? AND state='processing'").bind(JSON.stringify({ kind: 'attachment', attachmentId }), now, attempt.request.id)]); }
  catch (error) {
    await db.prepare("UPDATE chat_requests SET state='failed',updated_at=? WHERE id=? AND state='processing'").bind(iso(), attempt.request.id).run().catch(() => undefined);
    if (String(error).includes('chat_attachment_daily_bytes')) fail('chat_file_daily_budget', 429);
    if (/chat_attachment_(?:count|bytes)/.test(String(error))) fail('chat_file_limit', 429);
    fail('chat_file_reservation_unknown', 503);
  }
  return response(value);
}
async function upload(db: ChatDatabase, request: Request, env: ChatEnv, settings: ChatConfig, c: Conversation, attachmentId: string) {
  if (!UUID.test(attachmentId) || !(await filesPolicy(db, env, settings)).enabled) fail('chat_files_unavailable', 503);
  const file = await db.prepare('SELECT * FROM chat_attachments WHERE id=? AND conversation_id=? AND expires_at>?').bind(attachmentId, c.id, iso()).first<Attachment>();
  if (!file || c.status === 'closed') fail('chat_file_unavailable', 404);
  if (!validFileName(file.name, file.content_type)) fail('chat_file_type', 415);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== file.content_type) fail('chat_file_type', 415);
  const bytes = await boundedBytes(request, file.size); if (bytes.byteLength !== file.size || !signature(bytes, file.content_type)) fail('chat_file_signature', 415);
  const hash = await digest(bytes);
  if (['quarantined', 'scanning', 'clean', 'rejected', 'scan_failed'].includes(file.state) && file.sha256 === hash) return response({ id: file.id, state: publicFileState(file.state, file.expires_at) });
  if (file.state === 'reserved') {
    const claim = await db.prepare("UPDATE chat_attachments SET state='uploading',sha256=?,actual_size=?,updated_at=? WHERE id=? AND conversation_id=? AND state='reserved' AND expires_at>? AND EXISTS(SELECT 1 FROM chat_conversations WHERE id=? AND status<>'closed' AND expires_at>?)")
      .bind(hash, bytes.length, iso(), file.id, c.id, iso(), c.id, iso()).run();
    if (!claim.success) fail('chat_file_upload_unknown', 503);
  }
  const claimed = await db.prepare('SELECT * FROM chat_attachments WHERE id=? AND conversation_id=?').bind(file.id, c.id).first<Attachment>();
  if (!claimed || claimed.state === 'deleted' || claimed.expires_at <= iso()) fail('chat_file_unavailable', 410);
  if (claimed.sha256 !== hash || claimed.actual_size !== bytes.length) fail('chat_file_upload_conflict', 409);
  if (['quarantined', 'scanning', 'clean', 'rejected', 'scan_failed'].includes(claimed.state)) return response({ id: file.id, state: publicFileState(claimed.state, claimed.expires_at) });
  if (claimed.state !== 'uploading') fail('chat_file_upload_in_progress', 409);
  const exact = (object: ChatObject | null) => !!object && object.key === file.object_key && object.size === bytes.length
    && object.customMetadata?.sha256 === hash && object.customMetadata.conversationId === c.id && object.customMetadata.attachmentId === file.id;
  let object = await env.CHAT_FILES!.head(file.object_key);
  if (object && !exact(object)) fail('chat_file_object_conflict', 409);
  if (!object) {
    try { object = await env.CHAT_FILES!.put(file.object_key, bytes, { onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: file.content_type, contentDisposition: 'attachment' },
      customMetadata: { sha256: hash, conversationId: c.id, attachmentId: file.id } }); }
    catch { /* A lost PUT acknowledgement is reconciled by HEAD, never overwritten. */ }
    // Includes a concurrent conditional-create loser. Metadata is server-owned;
    // scanner/admin separately verify the downloaded bytes' hash before use.
    object = await env.CHAT_FILES!.head(file.object_key);
  }
  if (!exact(object)) fail('chat_file_upload_unknown', 503);
  try {
    const saved = await db.prepare("UPDATE chat_attachments SET state='quarantined',updated_at=? WHERE id=? AND state='uploading' AND sha256=? AND actual_size=? AND expires_at>? AND EXISTS(SELECT 1 FROM chat_conversations WHERE id=? AND status<>'closed' AND expires_at>?)")
      .bind(iso(), file.id, hash, bytes.length, iso(), c.id, iso()).run();
    if (saved.success && saved.meta?.changes === 1) return response({ id: file.id, state: 'quarantined' });
  } catch { /* Read the durable state before deciding whether cleanup is safe. */ }
  const observed = await db.prepare('SELECT a.state,a.sha256,a.actual_size,a.expires_at,c.status AS parent_status FROM chat_attachments a LEFT JOIN chat_conversations c ON c.id=a.conversation_id WHERE a.id=? AND a.conversation_id=?')
    .bind(file.id, c.id).first<{ state: string; sha256: string | null; actual_size: number | null; expires_at: string; parent_status: string | null }>();
  if (observed && observed.sha256 === hash && observed.actual_size === bytes.length && ['quarantined', 'scanning', 'clean', 'rejected', 'scan_failed'].includes(observed.state)
    && observed.parent_status && observed.parent_status !== 'closed' && observed.expires_at > iso()) return response({ id: file.id, state: publicFileState(observed.state, observed.expires_at) });
  // Absence/deletion is a successful D1 observation, not an exception/unknown
  // acknowledgement. Never blind-delete an object after an uncertain CAS.
  if (!observed || observed.state === 'deleted' || !observed.parent_status || observed.parent_status === 'closed' || observed.expires_at <= iso()) {
    if (exact(await env.CHAT_FILES!.head(file.object_key))) await env.CHAT_FILES!.delete(file.object_key);
    fail('chat_file_unavailable', 410);
  }
  fail('chat_file_upload_unknown', 503);
}
export async function handleChat(action: ChatAction, request: Request, env: ChatEnv, attachmentId?: string): Promise<Response> {
  try {
    const mutation = request.method !== 'GET';
    if (mutation || request.headers.has('origin')) originCheck(request, env);
    else { const origin = new URL(request.url).origin; originCheck(new Request(request.url, { headers: { origin } }), env); }
    const db = database(env), settings = await config(db);
    if (action === 'session' && request.method === 'POST') return await bootstrap(db, request, env, settings);
    const auth = await session(db, request); if (mutation) await csrfCheck(request, auth.token);
    const c = await ownedConversation(db, auth.session.id);
    if (action === 'session' && request.method === 'DELETE') {
      await jsonBody(request, 64);
      // Barrier before object deletion: a PUT already in flight cannot confirm
      // against a parent that this explicit clear action has closed.
      const closing = await db.prepare("UPDATE chat_conversations SET status='closed',version=version+1,updated_at=? WHERE id=? AND session_id=? AND status<>'closed'").bind(iso(), c.id, auth.session.id).run();
      if (!closing.success) fail('chat_delete_unknown', 503);
      const files = await all<{ object_key: string }>(db, "SELECT object_key FROM chat_attachments WHERE conversation_id=? AND state<>'deleted' LIMIT 3", c.id);
      if (files.length && !env.CHAT_FILES) fail('chat_delete_unavailable', 503);
      for (const file of files) await env.CHAT_FILES!.delete(file.object_key);
      const deleted = await db.prepare('DELETE FROM chat_sessions WHERE id=? AND cap_hash=?').bind(auth.session.id, await digest(auth.token)).run();
      if (!deleted.success || deleted.meta?.changes !== 1) fail('chat_delete_unknown', 503);
      return response({ deleted: true }, 200, { 'Set-Cookie': cookie('', true) });
    }
    if (action === 'conversation' && request.method === 'GET') return response({ conversation: await publicConversation(db, c), attachments: await attachments(db, c) });
    if (!settings.enabled) fail('chat_disabled', 503);
    if (action === 'message' && request.method === 'POST') return await sendMessage(db, request, env, settings, c);
    if (action === 'handoff' && request.method === 'POST') return await handoff(db, request, settings, c);
    if (action === 'attachments' && request.method === 'POST') return await reserveFile(db, request, env, settings, c);
    if (action === 'upload' && request.method === 'PUT') return await upload(db, request, env, settings, c, attachmentId ?? '');
    return response({ error: 'chat_method_not_allowed' }, 405);
  } catch (error) { return error instanceof Response ? error : response({ error: 'chat_temporarily_unavailable', code: 'chat_temporarily_unavailable' }, 503); }
}
