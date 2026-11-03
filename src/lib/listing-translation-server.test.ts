import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleListingTranslationRequest, listingTranslationSigningInput, LISTING_TRANSLATION_MODEL, LISTING_TRANSLATION_MAX_TOKENS,
  type TranslationAI, type ListingTranslationEnvironment } from './listing-translation-server';
import { protectListingText } from './listing-translation-protection';
import { hashListingText, type ListingText } from './listing-localization';
import { listingTranslationTestDatabase } from './listing-translation-test-db';

const SECRET = 'fictitious-local-listing-secret-at-least-32-bytes';
const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const SOURCE: ListingText = { title: 'Appartement JI-RAP-DKR-2609-0015', commercial_message: '250 000 XOF par mois',
  description: 'Surface 80 m². Contact +221 77 000 00 00 ou fictif@example.invalid ; https://example.invalid/bien.' };
const REF = 'JI-RAP-DKR-2609-0015';
const HOOK = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/fictitious';
const open: ReturnType<typeof listingTranslationTestDatabase>[] = [];
const fixture = () => { const result = listingTranslationTestDatabase(); open.push(result); return result; };
afterEach(() => { for (const item of open.splice(0)) item.sql.close(); vi.restoreAllMocks(); });
const prepare = (reference = REF, source = SOURCE) => ({ mode: 'prepare', property: { reference, ...source }, languages: ['en'] });
async function signed(body: unknown, now = NOW, rawOverride?: string) {
  const raw = JSON.stringify(body), timestamp = String(Math.floor(now / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(listingTranslationSigningInput(timestamp, raw))));
  const signature = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://listing-fixture.invalid/api/listing-translations/prepare', { method: 'POST', body: rawOverride ?? raw,
    headers: { 'content-type': 'application/json', 'x-listing-translation-timestamp': timestamp, 'x-listing-translation-signature': signature } });
}
function resultFor(input: Parameters<TranslationAI['run']>[1]) {
  const value = JSON.parse(input.messages[1].content) as { text: ListingText };
  return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content:
    JSON.stringify(Object.fromEntries(Object.entries(value.text).map(([key, text]) => [key, text ? `Translated ${text}` : '']))) } }] };
}
function environment(item: ReturnType<typeof fixture>, overrides: Partial<ListingTranslationEnvironment> = {}) {
  const run = vi.fn<TranslationAI['run']>(async (_model, input) => resultFor(input));
  return { env: { LISTING_TRANSLATION_SECRET: SECRET, INTAKE_DB: item.db, AI: { run }, ...overrides }, run };
}
const call = async (body: unknown, env: ListingTranslationEnvironment, now = NOW, fetcher?: typeof fetch) =>
  handleListingTranslationRequest(await signed(body, now), env, { now: () => now, ...(fetcher ? { fetcher } : {}) });

describe('listing literal protection', () => {
  it('restores every public number/contact/reference/URL exactly and keeps empty fields empty', () => {
    const source = { ...SOURCE, commercial_message: '' }, protectedText = protectListingText(source);
    expect(protectedText.text.description).not.toContain('+221');
    const translated = protectedText.restore({ ...protectedText.text, title: `Translated ${protectedText.text.title}` });
    expect(translated).toEqual({ ...source, title: `Translated ${source.title}` });
    expect(() => protectedText.restore({ ...protectedText.text, description: protectedText.text.description + ' 9999' })).toThrow();
    expect(() => protectedText.restore({ ...protectedText.text, description: protectedText.text.description + ' ١٩٩٩' })).toThrow();
    expect(() => protectedText.restore({ ...protectedText.text, description: protectedText.text.description + ' ۱۹۹۹' })).toThrow();
    expect(() => protectedText.restore({ ...protectedText.text, title: protectedText.text.title + protectedText.text.title })).toThrow();
    expect(() => protectedText.restore({ ...protectedText.text, commercial_message: 'invented' })).toThrow();
    expect(() => protectedText.restore({ ...protectedText.text, title: 'missing reference' })).toThrow();
  });
  it('applies final field bounds after expanding/restoring short literals, not to long placeholders', () => {
    const source = { title: Array.from({ length: 40 }, () => 'a1').join(' '), commercial_message: '', description: '' };
    const protectedText = protectListingText(source); expect(protectedText.text.title.length).toBeGreaterThan(300);
    expect(protectedText.restore(protectedText.text)).toEqual(source);
  });
});

describe('HMAC-only listing translation service with real SQLite', () => {
  it('refuses wrong methods, absent/stale/tampered signatures and oversized streamed bodies before any AI or SQL spend', async () => {
    const item = fixture(), { env, run } = environment(item);
    expect((await handleListingTranslationRequest(new Request('https://fixture.invalid', { method: 'GET' }), env)).status).toBe(405);
    expect((await handleListingTranslationRequest(new Request('https://fixture.invalid', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), env, { now: () => NOW })).status).toBe(401);
    expect((await handleListingTranslationRequest(await signed(prepare(), NOW - 301_000), env, { now: () => NOW })).status).toBe(401);
    expect((await handleListingTranslationRequest(await signed(prepare(), NOW, JSON.stringify(prepare()) + ' '), env, { now: () => NOW })).status).toBe(401);
    expect((await handleListingTranslationRequest(new Request('https://fixture.invalid', { method: 'POST', body: 'x'.repeat(65_537), headers: { 'content-type': 'application/json' } }), env)).status).toBe(413);
    expect(run).not.toHaveBeenCalled(); expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(0);
  });
  it('rejects extra property facts and unbounded/duplicate locales or pending selections', async () => {
    const item = fixture(), { env, run } = environment(item);
    for (const body of [{ ...prepare(), property: { ...prepare().property, price: 250000 } }, { ...prepare(), languages: ['en', 'en'] },
      { ...prepare(), languages: ['fr'] }, { mode: 'pending', limit: 6 }, { mode: 'pending', url: HOOK }]) {
      expect((await call(body, env)).status).toBe(400);
    }
    expect(run).not.toHaveBeenCalled(); expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translations').get()?.n).toBe(0);
  });
  it('generates one exact-source cache row with the bounded Gemma input, then serves cache hits even at budget zero', async () => {
    const item = fixture(), { env, run } = environment(item);
    const first = await call(prepare(), env); expect(first.status).toBe(200);
    const firstBody = await first.json(); expect(firstBody.counts).toEqual({ ready: 1, pending: 0 });
    expect(firstBody.cache.entries[REF].source).toEqual(SOURCE); expect(firstBody.cache.entries[REF].sourceHash).toBe(await hashListingText(SOURCE));
    expect(firstBody.cache.entries[REF].translations.en.description).toBe(`Translated ${SOURCE.description}`);
    expect(run).toHaveBeenCalledTimes(1); expect(run.mock.calls[0][0]).toBe(LISTING_TRANSLATION_MODEL);
    expect(run.mock.calls[0][1]).toMatchObject({ temperature: 0, max_completion_tokens: LISTING_TRANSLATION_MAX_TOKENS, response_format: { type: 'json_object' } });
    expect(run.mock.calls[0][1]).not.toHaveProperty('max_tokens');
    expect(run.mock.calls[0][1]).not.toHaveProperty('tools');
    const replay = await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    expect(await replay.json()).toEqual(firstBody); expect(run).toHaveBeenCalledTimes(1);
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(1);
  });
  it('ignores replaced hashes in pending, retains their rows and spends only on the newly prepared source', async () => {
    const item = fixture(), { env, run } = environment(item), next = { ...SOURCE, title: 'Nouvelle annonce' };
    await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    await call(prepare(REF, next), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    const result = await call({ mode: 'pending', limit: 5 }, env); expect(result.status).toBe(200);
    const body = await result.json(); expect(body.cache.entries[REF].source).toEqual(next); expect(body.counts).toEqual({ ready: 1, pending: 0 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(item.sql.prepare('SELECT source_hash FROM listing_translation_reservations').get()?.source_hash).toBe(await hashListingText(next));
    expect(item.sql.prepare('SELECT state,is_current FROM listing_translations WHERE source_hash=?').get(await hashListingText(SOURCE))).toEqual({ state: 'pending', is_current: 0 });
  });
  it('accepts an explicit legacy response envelope without substituting it for the current documented shape', async () => {
    const item = fixture(), { env, run } = environment(item);
    run.mockImplementationOnce(async (_model, input) => ({ response: resultFor(input).choices[0].message.content }));
    expect((await (await call(prepare(), env)).json()).counts).toEqual({ ready: 1, pending: 0 });
  });
  it.each(['length', 'content_filter', 'refusal', 'multiple'] as const)('holds current model %s output without publishing or refunding', async kind => {
    const item = fixture(), { env, run } = environment(item);
    run.mockImplementationOnce(async (_model, input) => {
      const response = resultFor(input);
      if (kind === 'length' || kind === 'content_filter') response.choices[0].finish_reason = kind;
      if (kind === 'multiple') response.choices.push(response.choices[0]);
      return kind === 'refusal' ? { choices: [{ finish_reason: 'stop', message: { content: response.choices[0].message.content, refusal: 'refused' } }] } : response;
    });
    const response = await call(prepare(), env); expect((await response.json()).counts).toEqual({ ready: 0, pending: 1 });
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(1);
  });
  it('reuses preserved ready content when the current source returns A→B→A without translating it again', async () => {
    const item = fixture(), { env, run } = environment(item), next = { ...SOURCE, title: 'Autre annonce' };
    await call(prepare(), env); await call(prepare(REF, next), env);
    const response = await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    expect((await response.json()).cache.entries[REF].source).toEqual(SOURCE); expect(run).toHaveBeenCalledTimes(2);
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translations').get()?.n).toBe(2);
  });
  it('fences concurrent identical requests to one model invocation and one immutable reservation', async () => {
    const item = fixture(), { env, run } = environment(item);
    await Promise.all([call(prepare(), env), call(prepare(), env)]);
    expect(run).toHaveBeenCalledTimes(1); expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(1);
    expect((await (await call(prepare(), env)).json()).counts).toEqual({ ready: 1, pending: 0 });
  });
  it('atomically bounds concurrent different keys by the same local daily budget', async () => {
    const item = fixture(), { env, run } = environment(item, { LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '190' });
    await Promise.all([call(prepare('ONE'), env), call(prepare('TWO'), env)]);
    expect(run).toHaveBeenCalledTimes(1);
    const spend = Number(item.sql.prepare('SELECT coalesce(sum(neurons),0) AS n FROM listing_translation_reservations').get()?.n);
    expect(spend).toBeGreaterThan(95); expect(spend).toBeLessThanOrEqual(190);
    expect(item.sql.prepare("SELECT count(*) AS n FROM listing_translations WHERE state='ready'").get()?.n).toBe(1);
  });
  it('keeps an invalid model response pending, charges it once and retries only on the next UTC day', async () => {
    const item = fixture(), { env, run } = environment(item);
    run.mockResolvedValueOnce({ response: JSON.stringify({ title: 'Invented 9999', commercial_message: '', description: '' }) });
    const failed = await call(prepare(), env); expect((await failed.json()).counts).toEqual({ ready: 0, pending: 1 });
    await call(prepare(), env); expect(run).toHaveBeenCalledTimes(1);
    const recovered = await call({ mode: 'pending', limit: 1 }, env, NOW + 86_400_000);
    expect((await recovered.json()).counts).toEqual({ ready: 1, pending: 0 }); expect(run).toHaveBeenCalledTimes(2);
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(2);
  });
  it('keeps unknown provider failure charged without same-day retry or fabricated translation', async () => {
    const item = fixture(), { env, run } = environment(item); run.mockRejectedValue(new Error('lost provider acknowledgement with private details'));
    const result = await call(prepare(), env); expect(result.status).toBe(200); expect(await result.json()).toEqual({ cache: { version: 1, entries: {} }, counts: { ready: 0, pending: 1 } });
    await call({ mode: 'pending' }, env); expect(run).toHaveBeenCalledTimes(1);
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(1);
  });
  it('does not publish a late old-source model response after another preparation replaced its hash', async () => {
    const item = fixture(); let release!: (value: unknown) => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); let original: Parameters<TranslationAI['run']>[1] | undefined;
    const { env, run } = environment(item); run.mockImplementationOnce(async (_model, input) => { original = input; entered(); return new Promise(resolve => { release = resolve; }); });
    const first = call(prepare(), env); await started;
    await call(prepare(REF, { ...SOURCE, title: 'Version plus récente' }), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    if (!original) throw new Error('Original AI input not captured'); release(resultFor(original));
    expect((await (await first).json()).cache.entries).toEqual({});
    expect(item.sql.prepare("SELECT count(*) AS n FROM listing_translations WHERE state='ready'").get()?.n).toBe(0);
    expect(item.sql.prepare('SELECT count(*) AS n FROM listing_translation_reservations').get()?.n).toBe(1);
  });
  it('recovers a lost prepare acknowledgement and a revived source without repeating AI or creating a hook loop', async () => {
    const item = fixture(), { env, run } = environment(item, { REVALIDATE_DEPLOY_HOOK_URL: HOOK });
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}'));
    // Discard the successful prepare response as if the caller lost its ACK.
    await call(prepare(), env, NOW, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await call({ mode: 'pending' }, env, NOW, fetcher)).status).toBe(200);
    await call({ mode: 'pending' }, env, NOW, fetcher);
    expect(run).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
    const next = { ...SOURCE, title: 'Autre texte temporaire' };
    await call(prepare(REF, next), env, NOW, fetcher);
    await call(prepare(), env, NOW, fetcher); // A → B → A reuses its ready cache.
    expect((await call({ mode: 'pending' }, env, NOW, fetcher)).status).toBe(200);
    await call(prepare(), env, NOW, fetcher); // Current cache hits cannot dirty it again.
    await call({ mode: 'pending' }, env, NOW, fetcher);
    expect(run).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retains dirty refresh after hook failure, retries without AI and acknowledges only after hook success', async () => {
    const item = fixture(), { env, run } = environment(item, { REVALIDATE_DEPLOY_HOOK_URL: HOOK });
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValue(new Response('{}'));
    await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' }, NOW, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await call({ mode: 'pending' }, env, NOW, fetcher)).status).toBe(503);
    expect(item.sql.prepare('SELECT state,revalidation_pending FROM listing_translations').get()).toEqual({ state: 'ready', revalidation_pending: 1 });
    expect((await call({ mode: 'pending' }, env, NOW, fetcher)).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(2);
    await call({ mode: 'pending' }, env, NOW, fetcher); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(item.sql.prepare('SELECT revalidation_pending FROM listing_translations').get()?.revalidation_pending).toBe(0);
  });
  it('fences refresh acknowledgement to the exact hash while a new ready hash appears during the hook', async () => {
    const item = fixture(), { env } = environment(item, { REVALIDATE_DEPLOY_HOOK_URL: HOOK });
    await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    const next = { ...SOURCE, title: 'Nouvelle version pendant rebuild' };
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
      await call(prepare(REF, next), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
      await call({ mode: 'pending' }, { ...env, REVALIDATE_DEPLOY_HOOK_URL: undefined });
      return new Response('{}');
    });
    expect((await call({ mode: 'pending' }, env, NOW, fetcher)).status).toBe(200);
    const state = item.sql.prepare('SELECT revalidation_pending,is_current FROM listing_translations WHERE source_hash=?').get(await hashListingText(next));
    expect(state).toEqual({ revalidation_pending: 1, is_current: 1 });
    expect(item.sql.prepare('SELECT revalidation_pending FROM listing_translations WHERE source_hash=?').get(await hashListingText(SOURCE))?.revalidation_pending).toBe(0);
  });
  it('refuses hook host overrides before spending and never accepts a client model or callback proxy', async () => {
    const item = fixture(), { env, run } = environment(item, { REVALIDATE_DEPLOY_HOOK_URL: 'https://foreign.invalid/hook' });
    await call(prepare(), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    expect((await call({ mode: 'pending' }, env)).status).toBe(503); expect(run).not.toHaveBeenCalled();
    expect((await call({ ...prepare(), model: 'foreign-model' }, env)).status).toBe(400);
  });
  it('makes the per-call reservation immutable and allows empty sources without AI spend', async () => {
    const item = fixture(), { env, run } = environment(item);
    await call(prepare(), env);
    expect(() => item.sql.exec('DELETE FROM listing_translation_reservations')).toThrow('listing_translation_reservation_immutable');
    expect(() => item.sql.exec('UPDATE listing_translation_reservations SET neurons=0')).toThrow();
    const empty = await call(prepare('EMPTY', { title: '', commercial_message: '', description: '' }), { ...env, LISTING_TRANSLATION_DAILY_NEURON_BUDGET: '0' });
    expect((await empty.json()).counts).toEqual({ ready: 1, pending: 0 }); expect(run).toHaveBeenCalledTimes(1);
  });
});
