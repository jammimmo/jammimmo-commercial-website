import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatClient, DEFAULT_POLICY, formatFileSize, safeSourceUrl, validateFiles } from './chat-client';

afterEach(() => { vi.unstubAllGlobals(); });

describe('public chat client safety and retry contract', () => {
  it('uses the global receiver for the default anonymous session transport', async () => {
    const session = { csrf: 'fictitious-default-csrf',
      conversation: { id: 'fa000000-0000-4000-8000-000000000006', status: 'bot', version: 1, messages: [] },
      policy: DEFAULT_POLICY, contacts: {}, attachments: [] };
    const globalReceiver: boolean[] = [];
    const request = vi.fn(function (this: unknown, _input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) {
      globalReceiver.push(this === globalThis);
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(JSON.stringify(session)));
    });
    vi.stubGlobal('fetch', request);
    await expect(new ChatClient().session()).resolves.toEqual(session);
    expect(globalReceiver).toEqual([true]); expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('/api/chat/session');
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
  });
  it('keeps capability out of payloads and carries CSRF only in same-origin requests', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrf: 'csrf-test', conversation: {}, policy: {} }))).mockResolvedValueOnce(new Response(JSON.stringify({ conversation: {}, message: {} })));
    const client = new ChatClient(request as typeof fetch);
    await client.session();
    const action = { requestId: 'same-retry-id', text: 'Une question' };
    await client.message(action);
    expect(request.mock.calls[1][0]).toBe('/api/chat/message');
    expect(request.mock.calls[1][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', headers: { 'X-Chat-CSRF': 'csrf-test', 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    expect(request.mock.calls[1][0]).not.toContain('csrf-test');
  });
  it('retains the caller request id for an uncertain retry and performs no automatic resend', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('lost acknowledgement'));
    const client = new ChatClient(request as typeof fetch);
    await expect(client.message({ requestId: 'retain-me', text: 'Question' })).rejects.toThrow('même envoi');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].body).toContain('retain-me');
  });
  it('does not turn a server outage into a successful empty transcript', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(new ChatClient(request as typeof fetch).conversation()).rejects.toMatchObject({ status: 503 });
  });
  it('distinguishes the daily file quota from other limits without promising an immediate retry', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'chat_file_daily_budget' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'chat_admission_rejected' }), { status: 429 }))
      .mockResolvedValueOnce(new Response('upstream limit', { status: 429 }));
    const client = new ChatClient(request as typeof fetch);
    await expect(client.conversation()).rejects.toMatchObject({ status: 429, message: 'Le quota quotidien de pièces jointes est atteint. Vous pouvez envoyer votre message sans fichier.' });
    for (let index = 0; index < 2; index++) {
      await expect(client.conversation()).rejects.toMatchObject({ status: 429, message: 'Une limite temporaire est atteinte. Réessayez plus tard. Votre texte reste ici.' });
    }
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('upload acknowledgement identity and retry', () => {
  const id = 'd6715323-70e3-463b-88f9-584bb5dbb504';
  const json = (body: unknown) => new Response(JSON.stringify(body));
  function origin() { vi.stubGlobal('window', { location: { origin: 'https://jammimmo.com' } }); }
  const selectedFile = () => new File(['local-bytes'], 'mon-plan.pdf', { type: 'application/pdf' });
  const reservation = () => json({ id, state: 'uploading', uploadUrl: `/api/chat/attachments/${id}` });
  it('completes a minimal server receipt with the selected file metadata and a charged reservation', async () => {
    origin(); const file = selectedFile();
    const request = vi.fn().mockResolvedValueOnce(reservation()).mockResolvedValueOnce(json({ id, state: 'quarantined' }));
    const result = await new ChatClient(request as typeof fetch).attachment(file, 'same-upload-id');
    expect(result).toEqual({ id, name: file.name, size: file.size, state: 'quarantined', countsTowardsQuota: true });
    expect(formatFileSize(result.size)).toBe('11 octets');
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: file });
  });
  it('ignores forged display metadata and rejects a receipt for another attachment', async () => {
    origin(); const file = selectedFile();
    const request = vi.fn().mockResolvedValueOnce(reservation()).mockResolvedValueOnce(json({ id, state: 'rejected', name: 'forged.exe', size: 0, countsTowardsQuota: false }))
      .mockResolvedValueOnce(reservation()).mockResolvedValueOnce(json({ id: 'another-file', state: 'clean' }));
    const client = new ChatClient(request as typeof fetch);
    expect(await client.attachment(file, 'one')).toEqual({ id, name: file.name, size: file.size, state: 'rejected', countsTowardsQuota: true });
    await expect(client.attachment(file, 'two')).rejects.toThrow('résultat du fichier');
  });
  it('refuses an upload destination outside the same-origin reserved path before sending bytes', async () => {
    origin(); const request = vi.fn().mockResolvedValueOnce(json({ id, state: 'uploading', uploadUrl: `https://evil.test/api/chat/attachments/${id}` }));
    await expect(new ChatClient(request as typeof fetch).attachment(selectedFile(), 'one')).rejects.toThrow('destination');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reuses the same reservation request id after a lost upload acknowledgement with no automatic resend', async () => {
    origin(); const file = selectedFile();
    const request = vi.fn().mockResolvedValueOnce(reservation()).mockRejectedValueOnce(new TypeError('acknowledgement lost'))
      .mockResolvedValueOnce(reservation()).mockResolvedValueOnce(json({ id, state: 'quarantined' }));
    const client = new ChatClient(request as typeof fetch);
    await expect(client.attachment(file, 'keep-upload-id')).rejects.toThrow('même envoi');
    expect(request).toHaveBeenCalledTimes(2);
    expect(await client.attachment(file, 'keep-upload-id')).toMatchObject({ id, size: file.size, countsTowardsQuota: true });
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[2][1].body);
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[3][0]);
  });
});

describe('upload preflight is a limit check, never an antivirus verdict', () => {
  const enabled = { ...DEFAULT_POLICY.files, enabled: true };
  const file = (name: string, type: string, size = 4) => ({ name, type, size }) as File;
  it('refuses files while the actual scanner is unavailable', () => { expect(validateFiles([file('a.pdf', 'application/pdf')], [], DEFAULT_POLICY.files)).toContain('pas disponibles'); });
  it('enforces count and byte limits including retained reservations', () => {
    expect(validateFiles([file('a.pdf', 'application/pdf')], Array.from({ length: 3 }, () => ({ size: 1, state: 'quarantined' as const })), enabled)).toContain('3 fichiers');
    expect(validateFiles([file('a.pdf', 'application/pdf', 6 * 1024 * 1024)], [], enabled)).toContain('5 Mio');
    expect(validateFiles([file('a.pdf', 'application/pdf')], [{ size: 15 * 1024 * 1024, state: 'clean' }], enabled)).toContain('poids total');
  });
  it('rejects empty, disguised and unsupported files before upload', () => {
    expect(validateFiles([file('a.pdf', 'application/pdf', 0)], [], enabled)).toBeTruthy();
    expect(validateFiles([file('a.exe', 'application/pdf')], [], enabled)).toBeTruthy();
    expect(validateFiles([file('a.png', 'application/pdf')], [], enabled)).toBeTruthy();
    expect(validateFiles([file('a\u202e.pdf', 'application/pdf')], [], enabled)).toBeTruthy();
    expect(validateFiles([file('a.svg', 'image/svg+xml')], [], enabled)).toBeTruthy();
    expect(validateFiles([file('a.pdf', 'application/pdf')], [], enabled)).toBeNull();
  });
  it('charges rejected and expired files conservatively until the server confirms deletion', () => {
    const retained = [{ size: 4, state: 'rejected' as const }, { size: 4, state: 'expired' as const }, { size: 4, state: 'quarantined' as const, countsTowardsQuota: true }];
    expect(validateFiles([file('a.pdf', 'application/pdf')], retained, enabled)).toContain('3 fichiers');
    expect(validateFiles([file('a.pdf', 'application/pdf')], retained.map(item => ({ ...item, countsTowardsQuota: false })), enabled)).toBeNull();
    expect(validateFiles([file('a.pdf', 'application/pdf')], [{ size: 15 * 1024 * 1024, state: 'rejected' }], enabled)).toContain('poids total');
    expect(validateFiles([file('a.pdf', 'application/pdf')], [{ size: NaN, state: 'expired' }], enabled)).toContain('pas pu être vérifié');
  });
});

describe('citation links', () => {
  it('only renders a link to the site and keeps precise anchors', () => {
    expect(safeSourceUrl('/guides/test#frais', 'https://jammimmo.com')).toBe('/guides/test#frais');
    expect(safeSourceUrl('https://evil.test/a', 'https://jammimmo.com')).toBeNull();
    expect(safeSourceUrl('javascript:alert(1)', 'https://jammimmo.com')).toBeNull();
    expect(safeSourceUrl('//evil.test/a', 'https://jammimmo.com')).toBeNull();
  });
});
