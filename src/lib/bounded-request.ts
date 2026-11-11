export class PayloadTooLargeError extends Error {
  constructor() { super('request payload too large'); this.name = 'PayloadTooLargeError'; }
}
/** Enforces the actual stream bytes, including absent or dishonest Content-Length. */
export async function readBoundedRequestText(request: Request, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError('invalid byte budget');
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break; if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel().catch(() => undefined); throw new PayloadTooLargeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}
