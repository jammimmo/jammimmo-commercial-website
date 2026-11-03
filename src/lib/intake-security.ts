function exactHttpsOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || url.hostname.includes('*') || value !== url.origin) return null;
    return url.origin;
  } catch { return null; }
}
/** Deployment-specific exact origin, never a preview-host suffix wildcard. */
export function isAllowedIntakeOrigin(origin: string | null, configured: string | undefined, allowLocal = false): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    if (allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return true;
    const approved = exactHttpsOrigin(configured);
    return approved !== null && url.protocol === 'https:' && !url.port && url.origin === approved;
  } catch { return false; }
}
export const isJsonContentType = (value: string | null) => (value ?? '').split(';')[0]!.trim().toLowerCase() === 'application/json';
/** Deployment-specific pseudonym, never raw IP persistence. */
export async function hashClientIp(ip: string, salt: string): Promise<string> {
  if (!ip || salt.length < 16) throw new Error('intake configuration unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`jamm-intake-ip:v1:${ip}`));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
