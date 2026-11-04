import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { LISTING_TRANSLATION_LOCALES, hashListingText } from '../src/lib/listing-localization.ts';
import { prepareListingTranslations, readPublicListingSources, requestTranslations, signTranslationRequest,
  CATALOGUE_COLUMNS, ADMIN_PROJECT_URL, TRANSLATION_ENDPOINT } from './prepare-listing-translations.mjs';

const source = { title: 'Annonce fictive', commercial_message: '', description: 'Description fictive française.' };
const ref = 'JI-TEST-FICTIF-001';
const secret = 'test-only-signing-key-not-an-actual-credential';
const env = { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', LISTING_TRANSLATIONS_ENABLED: 'true', LISTING_TRANSLATION_SECRET: secret };
const now = () => 1793692800000;
const translation = lang => ({ title: `Fictional ${lang}`, commercial_message: '', description: `Fictional description ${lang}.` });
async function cache(text = source, locales = []) {
  return { version: 1, entries: { [ref]: { source: { ...text }, sourceHash: await hashListingText(text),
    translations: Object.fromEntries(locales.map(lang => [lang, translation(lang)])) } } };
}
const response = (cache, ready, pending) => new Response(JSON.stringify({ cache, counts: { ready, pending } }),
  { headers: { 'content-type': 'application/json' } });
const empty = () => ({ version: 1, entries: {} });
function harness(previous = empty(), row = { reference: ref, ...source }) {
  const calls = { catalogue: 0, reads: 0, requests: [], writes: [] };
  return { calls, options: { env, now, loadCatalogue: async () => { calls.catalogue++; return [row]; },
    readCache: async () => { calls.reads++; return structuredClone(previous); },
    writeCache: async value => { calls.writes.push(structuredClone(value)); },
    request: async (url, init) => { calls.requests.push({ url, init }); return response(empty(), 0, 5); } } };
}

test('local and preview preparation do no network, catalogue read or cache write even with credentials present', async () => {
  for (const disabled of [{}, { ...env, CF_PAGES_BRANCH: 'preview' }, { ...env, CF_PAGES: undefined },
    { ...env, LISTING_TRANSLATIONS_ENABLED: 'false' }]) {
    const h = harness();
    assert.deepEqual(await prepareListingTranslations({ ...h.options, env: disabled }), { status: 'disabled' });
    assert.deepEqual(h.calls, { catalogue: 0, reads: 0, requests: [], writes: [] });
  }
});

test('unchanged exact source cache hits make no service call/write; photos, prices and updated_at are not inputs', async () => {
  const previous = await cache(source, LISTING_TRANSLATION_LOCALES);
  const h = harness(previous, { reference: ref, ...source, price: 123, images: ['different.jpg'], updated_at: 'changed' });
  const result = await prepareListingTranslations(h.options);
  assert.deepEqual(result, { status: 'prepared', listings: 1, ready: 5, pending: 0, skipped: 0 });
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.writes.length, 0);
});

test('each narrative edit invalidates prior translations rather than rebinding their old hash', async () => {
  for (const change of [{ title: source.title + ' ' }, { commercial_message: 'Nouvelle accroche fictive' }, { description: 'Autre texte fictif' }]) {
    const next = { ...source, ...change }, h = harness(await cache(source, LISTING_TRANSLATION_LOCALES), { reference: ref, ...next });
    const result = await prepareListingTranslations(h.options);
    assert.equal(result.ready, 0); assert.equal(result.pending, 5);
    const request = JSON.parse(h.calls.requests[0].init.body);
    assert.deepEqual(request, { mode: 'prepare', property: { reference: ref, ...next }, languages: [...LISTING_TRANSLATION_LOCALES] });
    const written = h.calls.writes[0].entries[ref];
    assert.equal(written.sourceHash, await hashListingText(next)); assert.deepEqual(written.translations, {});
  }
});

test('one exact-count SDK query rejects errors or truncation before any cache publication and normalizes only DB null narrative fields', async () => {
  const events = [];
  function factory(reply) { return (url, key, options) => {
    assert.equal(url, ADMIN_PROJECT_URL); assert.equal(key, 'fictitious-admin-build-key');
    assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false);
    return { from(table) { events.push(['from', table]); return { select(columns, options) {
      events.push(['select', columns, options]); return { eq(field, value) {
        events.push(['eq', field, value]); return { eq(field, value) { events.push(['eq', field, value]); return Promise.resolve(reply); } };
      } };
    } }; } };
  }; }
  const settings = { ADMIN_SUPABASE_SERVICE_ROLE_KEY: 'fictitious-admin-build-key' };
  const row = { reference: ref, title: source.title, commercial_message: null, description: null };
  assert.deepEqual(await readPublicListingSources(settings, factory({ data: [row], error: null, count: 1 })),
    [{ reference: ref, title: source.title, commercial_message: '', description: '' }]);
  assert.deepEqual(events, [['from', 'properties'], ['select', CATALOGUE_COLUMNS, { count: 'exact' }],
    ['eq', 'is_public', true], ['eq', 'status', 'Disponible']]);
  for (const reply of [{ data: [row], error: null, count: 2 }, { data: [], error: null, count: null },
    { data: null, error: { message: 'not logged' }, count: null }]) {
    const h = harness(); h.options.loadCatalogue = () => readPublicListingSources(settings, factory(reply));
    await assert.rejects(prepareListingTranslations(h.options));
    assert.equal(h.calls.reads, 0); assert.equal(h.calls.writes.length, 0); assert.equal(h.calls.requests.length, 0);
  }
  await assert.rejects(readPublicListingSources({ ...settings, ADMIN_SUPABASE_URL: 'https://foreign.example.invalid' }, factory({})), /refused/);
});

test('honest HTTP200 quota/pending preserves the valid partial cache and leaves French source available', async () => {
  const previous = await cache(source, ['en']), h = harness(previous);
  h.options.request = async () => response(empty(), 0, 4);
  const result = await prepareListingTranslations(h.options);
  assert.equal(result.ready, 1); assert.equal(result.pending, 4);
  assert.equal(h.calls.writes.length, 0); assert.deepEqual(previous.entries[ref].source, source);
});

test('HTTP503 and a lost transport acknowledgement refuse the build before any cache write, including fresh checkouts', async () => {
  for (const previous of [empty(), await cache(source, ['en'])]) for (const transport of [false, true]) {
    const h = harness(previous);
    h.options.request = async () => { if (transport) throw new Error('connection lost'); return new Response('{}', { status: 503 }); };
    await assert.rejects(prepareListingTranslations(h.options));
    assert.equal(h.calls.writes.length, 0);
  }
});

test('response hash/source mismatch is rejected and never written as a successful translation', async () => {
  const h = harness(), forged = await cache(source, ['en']); forged.entries[ref].sourceHash = '0'.repeat(64);
  h.options.request = async () => response(forged, 1, 4);
  await assert.rejects(prepareListingTranslations(h.options));
  assert.equal(h.calls.writes.length, 0);
  const changed = await cache({ ...source, title: 'Another current source' }, ['en']);
  h.options.request = async () => response(changed, 1, 4);
  await assert.rejects(prepareListingTranslations(h.options));
  assert.equal(h.calls.writes.length, 0);
});

test('signed POST uses exact UTF-8 raw body and fixed origin, merges only requested current-source locales', async () => {
  const h = harness(await cache(source, ['en'])), bodyReply = await cache(source, ['ar', 'it', 'es', 'wo']);
  h.options.request = async (url, init) => {
    assert.equal(url, TRANSLATION_ENDPOINT); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    const timestamp = String(Math.floor(now() / 1000));
    assert.equal(init.headers['x-listing-translation-timestamp'], timestamp);
    assert.equal(init.headers['x-listing-translation-signature'], createHmac('sha256', secret)
      .update(`listing-translations:v1\n${timestamp}\n${init.body}`, 'utf8').digest('hex'));
    assert.equal(signTranslationRequest(secret, timestamp, init.body), init.headers['x-listing-translation-signature']);
    assert.deepEqual(JSON.parse(init.body).languages, ['wo', 'es', 'it', 'ar']);
    return response(bodyReply, 4, 0);
  };
  assert.equal((await prepareListingTranslations(h.options)).ready, 5);
  assert.deepEqual(h.calls.writes[0].entries[ref].translations.en, translation('en'));
});

test('scheduled main pending retry is bounded and performs no catalogue/cache read or write', async () => {
  const h = harness(); h.options.env = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main',
    LISTING_TRANSLATIONS_ENABLED: 'true', LISTING_TRANSLATION_SECRET: secret };
  h.options.request = async (_url, init) => { assert.deepEqual(JSON.parse(init.body), { mode: 'pending', limit: 5 }); return response(empty(), 0, 3); };
  assert.deepEqual(await prepareListingTranslations({ ...h.options, mode: 'pending', limit: 5 }), { status: 'pending-processed', ready: 0, pending: 3 });
  assert.equal(h.calls.catalogue, 0); assert.equal(h.calls.reads, 0); assert.equal(h.calls.writes.length, 0);
  await assert.rejects(prepareListingTranslations({ ...h.options, mode: 'pending', limit: 6 }));
  assert.deepEqual(await prepareListingTranslations({ ...h.options, env: { ...h.options.env, GITHUB_REF: 'refs/heads/preview' }, mode: 'pending' }), { status: 'disabled' });
});

test('response bytes and exact supported locale/text shapes are bounded before publication', async () => {
  await assert.rejects(requestTranslations({ mode: 'pending', limit: 1 }, { secret, now,
    request: async () => new Response('x'.repeat(1024 * 1024 + 1)) }));
  const h = harness(), invalid = await cache(source, ['en']); invalid.entries[ref].translations.fr = translation('fr');
  h.options.request = async () => response(invalid, 2, 3);
  await assert.rejects(prepareListingTranslations(h.options));
  assert.equal(h.calls.writes.length, 0);
  h.options.loadCatalogue = async () => [{ reference: ref, ...source, title: 123 }];
  await assert.rejects(prepareListingTranslations(h.options));
});

test('historical oversized source remains unchanged and skips inference without blocking French publication', async () => {
  const row = { reference: ref, ...source, description: 'Description fictive '.repeat(600) }, h = harness(empty(), row);
  const result = await prepareListingTranslations(h.options);
  assert.deepEqual(result, { status: 'prepared', listings: 1, ready: 0, pending: 0, skipped: 1 });
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.writes.length, 0);
  assert.equal(row.description.length, 'Description fictive '.repeat(600).length);
});
