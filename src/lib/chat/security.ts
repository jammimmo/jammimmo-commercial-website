import type { ChatEnv } from './types';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const iso = () => new Date().toISOString();
export const expires = (milliseconds: number) => new Date(Date.now() + milliseconds).toISOString();
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function fail(code: string, status = 400): never { throw response({ error: code, code }, status); }
export function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = new Uint8Array(typeof value === 'string' ? new TextEncoder().encode(value) : value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function capability() { return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function cookie(value: string, remove = false, maxAge = 604800) {
  return `__Host-jamm-chat=${value}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${remove ? 0 : Math.min(604800, maxAge)}`;
}
export function readCapability(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith('__Host-jamm-chat='));
  if (values.length !== 1) return null;
  const token = values[0].slice('__Host-jamm-chat='.length);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function originCheck(request: Request, env: ChatEnv) {
  const own = new URL(request.url).origin, origin = request.headers.get('origin');
  const origins = (env.CHAT_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const configured = origins.some(value => {
    try { const u = new URL(value); return value === u.origin && u.protocol === 'https:' && !u.username && !u.password && !u.port && value === own; }
    catch { return false; }
  });
  const local = env.CHAT_TEST_MODE === 'true' && /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]+$/.test(own);
  if ((!configured && !local) || origin !== own) fail('chat_origin_rejected', 403);
}
export async function csrfCheck(request: Request, token: string) {
  const expected = await digest(token + ':csrf:v1');
  const supplied = request.headers.get('x-chat-csrf') ?? '';
  if (supplied.length !== expected.length) fail('chat_csrf_rejected', 403);
  let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (difference) fail('chat_csrf_rejected', 403);
}
export async function boundedBytes(request: Request, max: number) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) fail('chat_body_too_large', 413);
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength; if (size > max) { await reader.cancel().catch(() => undefined); fail('chat_body_too_large', 413); }
    chunks.push(part.value);
  } } finally { reader.releaseLock(); }
  const out = new Uint8Array(size); let at = 0; for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; } return out;
}
export async function jsonBody(request: Request, max = 8192): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('chat_json_required', 415);
  let value: unknown; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(request, max))); }
  catch (error) { if (error instanceof Response) throw error; fail('chat_invalid_json'); }
  if (!record(value)) fail('chat_invalid_body'); return value;
}
export function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('chat_invalid_text');
  return value.trim();
}
export async function networkHash(request: Request, env: ChatEnv) {
  const ip = request.headers.get('cf-connecting-ip') ?? (env.CHAT_TEST_MODE === 'true' ? 'local-fixture' : '');
  if (!ip || !env.CHAT_IP_HASH_SALT || env.CHAT_IP_HASH_SALT.length < 16) fail('chat_unavailable', 503);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.CHAT_IP_HASH_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('chat-ip:v1:' + ip)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
