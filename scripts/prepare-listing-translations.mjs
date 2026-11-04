import { createHmac, randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LISTING_TRANSLATION_LOCALES, LISTING_TEXT_LIMITS, normalizeListingText, hashListingText } from '../src/lib/listing-localization.ts';

export const TRANSLATION_ENDPOINT = 'https://jammimmo.com/api/listing-translations/prepare';
export const ADMIN_PROJECT_URL = 'https://ygaawqgwxlbtkcuqecxh.supabase.co';
export const CATALOGUE_COLUMNS = 'reference,title,commercial_message,description';
const CACHE_PATH = fileURLToPath(new URL('../src/data/listing-localizations.json', import.meta.url));
const MAX_RESPONSE_BYTES = 1024 * 1024, MAX_CACHE_BYTES = 64 * 1024 * 1024, MAX_LISTINGS = 1000;
const TEXT_KEYS = ['title', 'commercial_message', 'description'];
const fail = code => { throw new PreparationError(code); };
export class PreparationError extends Error {
  constructor(code) { super('Listing translation preparation refused'); this.code = code; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.getOwnPropertyDescriptor(value, key)?.enumerable
    && 'value' in Object.getOwnPropertyDescriptor(value, key));
const reference = value => typeof value === 'string' && value.length > 0 && value.length <= 120
  && value === value.trim() && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value);
const emptyCache = () => ({ version: 1, entries: Object.create(null) });

export function preparationEnabled(env, mode = 'prepare') {
  if (env.LISTING_TRANSLATIONS_ENABLED !== 'true') return false;
  return mode === 'pending'
    ? env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF === 'refs/heads/main'
    : env.CF_PAGES === '1' && env.CF_PAGES_BRANCH === 'main';
}

export function normalizeCatalogueRow(row) {
  if (!object(row) || !reference(row.reference)) fail('catalogue-shape');
  const text = { title: row.title, commercial_message: row.commercial_message === null ? '' : row.commercial_message,
    description: row.description === null ? '' : row.description };
  for (const key of TEXT_KEYS) if (typeof text[key] !== 'string' || text[key].includes('\0')
    || /[\uD800-\uDFFF]/u.test(text[key])) fail('catalogue-shape');
  // Historical long text still belongs on the French listing. Exclude it from
  // inference below, without truncating it or blocking the source publication.
  return { reference: row.reference, ...text };
}

/** One exact-count query. A truncated response is never an empty catalogue. */
export async function readPublicListingSources(env, createClient) {
  const url = env.ADMIN_SUPABASE_URL || ADMIN_PROJECT_URL;
  if (url !== ADMIN_PROJECT_URL || !env.ADMIN_SUPABASE_SERVICE_ROLE_KEY) fail('catalogue-configuration');
  const db = createClient(url, env.ADMIN_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let reply;
  try { reply = await db.from('properties').select(CATALOGUE_COLUMNS, { count: 'exact' })
    .eq('is_public', true).eq('status', 'Disponible'); } catch { fail('catalogue-unavailable'); }
  if (!reply || reply.error !== null || !Array.isArray(reply.data) || !Number.isSafeInteger(reply.count)
    || reply.count !== reply.data.length || reply.count > MAX_LISTINGS) fail('catalogue-incomplete');
  const rows = reply.data.map(normalizeCatalogueRow);
  if (new Set(rows.map(row => row.reference)).size !== rows.length) fail('catalogue-shape');
  return rows;
}

/** Strict generated wire, never a rebinding of the historical reference-only map. */
export async function validateCacheFile(value, sources) {
  if (!exactKeys(value, ['version', 'entries']) || value.version !== 1 || !object(value.entries)
    || Reflect.ownKeys(value.entries).length > MAX_LISTINGS) fail('cache-invalid');
  const result = emptyCache();
  for (const ref of Reflect.ownKeys(value.entries)) {
    if (!reference(ref)) fail('cache-invalid');
    const descriptor = Object.getOwnPropertyDescriptor(value.entries, ref), entry = descriptor?.value;
    if (!descriptor?.enumerable || !exactKeys(entry, ['source', 'sourceHash', 'translations'])
      || !exactKeys(entry.source, TEXT_KEYS) || !object(entry.translations)) fail('cache-invalid');
    let source;
    try { source = normalizeListingText(entry.source); } catch { fail('cache-invalid'); }
    const hash = await hashListingText(source);
    if (entry.sourceHash !== hash || sources && (!sources.has(ref)
      || sources.get(ref).sourceHash !== hash || JSON.stringify(sources.get(ref).source) !== JSON.stringify(source))) fail('cache-source-mismatch');
    const translations = Object.create(null);
    for (const lang of Reflect.ownKeys(entry.translations)) {
      if (!LISTING_TRANSLATION_LOCALES.includes(lang)) fail('cache-invalid');
      const field = Object.getOwnPropertyDescriptor(entry.translations, lang);
      if (!field?.enumerable || !exactKeys(field.value, TEXT_KEYS)) fail('cache-invalid');
      let text;
      try { text = normalizeListingText(field.value); } catch { fail('cache-invalid'); }
      if (TEXT_KEYS.some(key => !source[key].trim() !== !text[key].trim())) fail('cache-invalid');
      translations[lang] = text;
    }
    result.entries[ref] = { source, sourceHash: hash, translations };
  }
  return result;
}

export function signTranslationRequest(secret, timestamp, rawBody) {
  if (typeof secret !== 'string' || secret.length < 32 || !/^\d{10}$/.test(timestamp)) fail('service-configuration');
  return createHmac('sha256', secret).update(`listing-translations:v1\n${timestamp}\n${rawBody}`, 'utf8').digest('hex');
}

async function responseJson(response) {
  if (!response?.ok || !response.body) fail('service-unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('service-response'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode(); return JSON.parse(text);
  } catch { fail('service-response'); } finally { reader.releaseLock(); }
}

export async function requestTranslations(body, { secret, request = (url, init) => globalThis.fetch(url, init), now = Date.now, sources }) {
  const rawBody = JSON.stringify(body), timestamp = String(Math.floor(now() / 1000));
  if (Buffer.byteLength(rawBody, 'utf8') > 65536) fail('service-request');
  const signature = signTranslationRequest(secret, timestamp, rawBody);
  let response;
  try { response = await request(TRANSLATION_ENDPOINT, { method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(500_000), headers: { 'content-type': 'application/json',
      'x-listing-translation-timestamp': timestamp, 'x-listing-translation-signature': signature }, body: rawBody });
  } catch { fail('service-unavailable'); }
  const reply = await responseJson(response);
  if (!exactKeys(reply, ['cache', 'counts']) || !exactKeys(reply.counts, ['ready', 'pending'])
    || ![reply.counts.ready, reply.counts.pending].every(n => Number.isSafeInteger(n) && n >= 0)) fail('service-response');
  const cache = await validateCacheFile(reply.cache, sources);
  const ready = Object.values(cache.entries).reduce((n, entry) => n + Object.keys(entry.translations).length, 0);
  const selected = body.mode === 'prepare' ? body.languages.length : body.limit;
  if (ready !== reply.counts.ready || reply.counts.ready + reply.counts.pending > selected
    || body.mode === 'prepare' && reply.counts.ready + reply.counts.pending !== selected) fail('service-response');
  if (body.mode === 'prepare' && Object.values(cache.entries).some(entry => Object.keys(entry.translations)
    .some(lang => !body.languages.includes(lang)))) fail('service-response');
  return { cache, counts: reply.counts };
}

async function readLocalCache() {
  let handle;
  try {
    handle = await open(CACHE_PATH, 'r');
    if ((await handle.stat()).size > MAX_CACHE_BYTES) fail('cache-invalid');
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) { if (error?.code === 'ENOENT') return emptyCache(); fail('cache-invalid'); }
  finally { await handle?.close(); }
}
async function writeLocalCache(cache) {
  const text = JSON.stringify(cache, null, 2) + '\n';
  if (Buffer.byteLength(text, 'utf8') > MAX_CACHE_BYTES) fail('cache-invalid');
  const temp = `${CACHE_PATH}.tmp-${randomUUID()}`; let handle, created = false;
  try {
    handle = await open(temp, 'wx', 0o600); created = true;
    await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = null;
    await rename(temp, CACHE_PATH); created = false;
  } finally { await handle?.close(); if (created) await unlink(temp); }
}

/** Injectable I/O for hermetic tests. No provider, SDK or file work before gate. */
export async function prepareListingTranslations({ env = process.env, mode = 'prepare', limit = 3,
  loadCatalogue, readCache = readLocalCache, writeCache = writeLocalCache, request, now } = {}) {
  if (!['prepare', 'pending'].includes(mode)) fail('mode-invalid');
  if (!preparationEnabled(env, mode)) return { status: 'disabled' };
  if (mode === 'pending' && (!Number.isInteger(limit) || limit < 1 || limit > 5)) fail('limit-invalid');
  const secret = env.LISTING_TRANSLATION_SECRET;
  if (!secret) fail('service-configuration');
  if (mode === 'pending') {
    const reply = await requestTranslations({ mode: 'pending', limit }, { secret, request, now });
    return { status: 'pending-processed', ...reply.counts };
  }
  const rows = loadCatalogue ? await loadCatalogue() : await readPublicListingSources(env,
    (await import('@supabase/supabase-js')).createClient);
  const current = new Map(), seen = new Set(); let skipped = 0;
  for (const raw of rows) {
    const property = normalizeCatalogueRow(raw);
    if (seen.has(property.reference) || seen.size >= MAX_LISTINGS) fail('catalogue-shape');
    seen.add(property.reference);
    if (TEXT_KEYS.some(key => property[key].length > LISTING_TEXT_LIMITS[key])) { skipped++; continue; }
    const source = normalizeListingText(property);
    current.set(property.reference, { source, sourceHash: await hashListingText(source) });
  }
  const previous = await validateCacheFile(await readCache()), next = emptyCache();
  for (const [ref, entry] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
    const old = previous.entries[ref];
    const translations = old?.sourceHash === entry.sourceHash && JSON.stringify(old.source) === JSON.stringify(entry.source)
      ? { ...old.translations } : {};
    const languages = LISTING_TRANSLATION_LOCALES.filter(lang => !translations[lang]);
    if (languages.length) {
      // HTTP200 pending is a truthful untranslated source. A transport or
      // protocol failure must preserve the previous deployed site, especially
      // on a fresh build checkout that has no generated local cache yet.
      const reply = await requestTranslations({ mode: 'prepare', property: { reference: ref, ...entry.source }, languages },
        { secret, request, now, sources: new Map([[ref, entry]]) });
      Object.assign(translations, reply.cache.entries[ref]?.translations);
    }
    next.entries[ref] = { ...entry, translations };
  }
  if (JSON.stringify(previous) !== JSON.stringify(next)) await writeCache(next);
  const ready = Object.values(next.entries).reduce((n, entry) => n + Object.keys(entry.translations).length, 0);
  return { status: 'prepared', listings: rows.length, ready, pending: current.size * LISTING_TRANSLATION_LOCALES.length - ready, skipped };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let mode = 'prepare', limit = 3;
  if (argv.length) {
    if (argv[0] !== '--retry-pending' || argv.length > 2 || argv[1] && !/^--limit=[1-5]$/.test(argv[1])) fail('arguments-invalid');
    mode = 'pending'; if (argv[1]) limit = Number(argv[1].slice('--limit='.length));
  }
  return prepareListingTranslations({ env, mode, limit });
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log('[listing-translations]', JSON.stringify(await main())); }
  catch (error) { console.error('[listing-translations] preparation refused:', error instanceof PreparationError ? error.code : 'preparation-unavailable'); process.exitCode = 1; }
}
