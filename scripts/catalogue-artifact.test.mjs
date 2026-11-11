import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueBuildMode, catalogueBuildContext, catalogueAliases, SNAPSHOT_SOURCE, SNAPSHOT_SHA256, PROPERTY_SELECT } from './catalogue-artifact.mjs';
import { FEATURE_KEYS } from '../src/lib/public-catalogue.ts';
import { prepareCatalogueBuild } from './build-approved-catalogue.mjs';
import { LISTING_TRANSLATION_LOCALES, hashListingText } from '../src/lib/listing-localization.ts';
import { TRANSLATION_ENDPOINT } from './prepare-listing-translations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const original = JSON.parse(await readFile(new URL('../src/data/public-catalogue-20261031.json', import.meta.url), 'utf8'));
const publicKey = 'fixture.' + Buffer.from(JSON.stringify({ role: 'anon', ref: 'ygaawqgwxlbtkcuqecxh' })).toString('base64url') + '.fixture';
const production = () => ({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_COMMIT_SHA: 'a'.repeat(40), CF_PAGES_URL: 'https://fixture123.jammimmo-vitrine.pages.dev', CATALOGUE_BUILD_SOURCE: 'trusted-production', PUBLIC_SUPABASE_URL: 'https://ygaawqgwxlbtkcuqecxh.supabase.co', PUBLIC_SUPABASE_ANON_KEY: publicKey });
const capturedAt = '2026-11-01T13:07:00Z';
const sourceRows = () => original.properties.map(row => ({ ...row, is_public: true, deleted_at: null, ...Object.fromEntries(FEATURE_KEYS.map(key => ['public_' + key, row.attributes[key] ?? null])), ...Object.fromEntries(['month', 'night', 'week'].map(key => ['public_pricing_' + key, null])) }));
const sourceZones = rows => rows.filter(row => row.geo).map(row => ({ id: row.id, center_lat: row.geo.centerLat, center_lng: row.geo.centerLng, radius_m: 500 }));
const response = (rows, count = rows.length) => new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json', 'content-range': (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + count } });
function source(rows, options = {}) {
  const calls = [];
  const fetcher = async (url, request) => {
    calls.push({ url: String(url), request });
    assert.equal(new URL(url).origin, 'https://ygaawqgwxlbtkcuqecxh.supabase.co');
    assert.equal(request.method, 'GET'); assert.equal(request.redirect, 'error'); assert.equal(request.headers.Prefer, 'count=exact');
    assert.equal(request.headers.apikey, publicKey); assert.equal(new URL(url).searchParams.get('order'), 'id.asc');
    assert.equal(new URL(url).searchParams.get('limit'), '1000');
    if (new URL(url).pathname.endsWith('/properties')) {
      assert.equal(new URL(url).searchParams.get('is_public'), 'eq.true'); assert.equal(new URL(url).searchParams.get('status'), 'eq.Disponible');
      assert.equal(new URL(url).searchParams.get('deleted_at'), 'is.null');
      return options.properties ? options.properties() : response(rows);
    }
    assert.ok(new URL(url).pathname.endsWith('/properties_public_geo'));
    return options.geo ? options.geo() : response(sourceZones(rows));
  };
  return { calls, fetcher, now: () => capturedAt };
}
async function scratch(t) { const path = await mkdtemp(join(tmpdir(), 'jamm-public-catalogue-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
function poisonCredentials(env, names = ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY']) {
  for (const key of names) Object.defineProperty(env, key, { enumerable: true, get() { throw new Error('Credential was read'); } });
  return env;
}

test('local, CI and preview select approved97 without touching even credential accessors', async () => {
  for (const env of [{}, { CI: 'true', GITHUB_ACTIONS: 'true' }, { ...production(), CF_PAGES_BRANCH: 'feature/preview', CATALOGUE_BUILD_SOURCE: undefined }]) {
    const result = await prepareCatalogueBuild(poisonCredentials(env), root, { fetcher: () => { throw new Error('Network forbidden'); } });
    assert.equal(result.CATALOGUE_BUILD_SOURCE, SNAPSHOT_SOURCE); assert.equal(result.CATALOGUE_SNAPSHOT_SHA256, SNAPSHOT_SHA256);
    for (const key of ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY']) assert.equal(result[key], '');
  }
});

test('unknown/ambiguous contexts and stale production snapshot fail before credentials or network', async () => {
  const cases = [
    { CF_PAGES_BRANCH: 'main' }, { CF_PAGES: '0' }, { ...production(), CF_PAGES_COMMIT_SHA: '' },
    { ...production(), CF_PAGES_URL: 'https://evil.example/' }, { ...production(), CF_PAGES_URL: 'https://jammimmo-vitrine.pages.dev.evil.example/' },
    { ...production(), CF_PAGES_BRANCH: '' }, { ...production(), CATALOGUE_BUILD_SOURCE: undefined },
    { ...production(), CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE, CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 },
    { ...production(), CF_PAGES_BRANCH: 'preview' }, { CATALOGUE_BUILD_SOURCE: 'trusted-production' },
    { CATALOGUE_ARTIFACT_DIR: '.catalogue-build/anything' },
  ];
  for (const env of cases) await assert.rejects(prepareCatalogueBuild(poisonCredentials(env), root, { fetcher: () => { throw new Error('Network forbidden'); } }), error => !error.message.includes('Credential was read') && !error.message.includes('Network forbidden'));
  assert.equal(catalogueBuildContext(production()), 'production'); assert.equal(catalogueBuildMode(production()), 'trusted-production');
});

test('fresh98 is projected once, hashes agree and the child receives no admin credentials', async t => {
  const folder = await scratch(t), rows = sourceRows();
  rows.push({ ...rows[0], id: '12345678-1234-4234-8234-123456789098', reference: 'JI-NEW-00098', title: 'Fixture new public property', geo: null });
  rows[0].attributes = { privateOwnerPrice: 3, commission: 7, tour: { secret: true } }; rows[0].documents = { owner: 'https://private.invalid/document.pdf' }; rows[0].gps = 'PRIVATE-EXACT-GPS';
  const deps = source(rows), env = await prepareCatalogueBuild(poisonCredentials(production(), ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY']), folder, deps);
  assert.equal(deps.calls.length, 2);
  assert.equal(env.CATALOGUE_BUILD_SOURCE, 'prepared-production');
  for (const key of ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY']) assert.equal(env[key], '');
  const aliases = catalogueAliases(env, folder), catalogue = JSON.parse(await readFile(aliases['@catalogue-public'], 'utf8'));
  assert.equal(aliases['@catalogue-public?raw'], aliases['@catalogue-public'] + '?raw');
  const facts = JSON.parse(await readFile(aliases['@catalogue-facts'], 'utf8'));
  assert.equal(catalogue.properties.length, 98); assert.equal(facts.listings.length, 98); assert.equal(catalogue.capture.capturedAt, capturedAt);
  assert.deepEqual(catalogue.capture, facts.capture); assert.deepEqual(catalogue.properties.map(row => row.id), facts.listings.map(row => row.id));
  assert.equal(catalogue.properties.at(-1).reference, 'JI-NEW-00098');
  const serialized = JSON.stringify({ catalogue, facts });
  for (const forbidden of ['privateOwnerPrice', 'PRIVATE-EXACT-GPS', 'private.invalid', publicKey, 'ygaawqgwxlbtkcuqecxh']) assert.ok(!serialized.includes(forbidden), forbidden);
  assert.ok(!PROPERTY_SELECT.split(',').some(field => ['address', 'attributes', 'documents', 'gps', 'commission_amount', 'negotiable_price'].includes(field)));
  assert.ok(!PROPERTY_SELECT.includes('attributes->')); assert.equal(catalogue.properties[0].address, null);
  assert.ok(facts.listings.every(row => row.rentalPeriod === null));
});

test('a removal and repricing replace both catalogue and facts, never overlay the old97', async t => {
  const folder = await scratch(t), rows = sourceRows(), removed = rows.shift(); rows[0].price = 987654321;
  const env = await prepareCatalogueBuild(production(), folder, source(rows)), aliases = catalogueAliases(env, folder);
  for (const [alias, key] of [['@catalogue-public', 'properties'], ['@catalogue-facts', 'listings']]) {
    const value = JSON.parse(await readFile(aliases[alias], 'utf8'));
    assert.equal(value[key].length, 96); assert.ok(!value[key].some(row => row.id === removed.id)); assert.equal(value[key][0].price, 987654321);
  }
});

test('exact healthy zero is distinct from an error or an unknown count', async t => {
  const folder = await scratch(t), env = await prepareCatalogueBuild(production(), folder, source([]));
  const aliases = catalogueAliases(env, folder); assert.equal(JSON.parse(await readFile(aliases['@catalogue-public'], 'utf8')).properties.length, 0);
});

test('published environment text survives production preparation without inventing a distance', async t => {
  const folder = await scratch(t), rows = sourceRows();
  // Flow stores nearby_commerce as JSONB and preserves existing string labels;
  // 100m/500m/1km are editor suggestions, not a constraint on historical rows.
  const nearby = [
    { name: 'Pharmacie', distance: '200m' }, { name: 'École', distance: '5 min' },
    { name: 'Marché', distance: '' }, { name: 'A'.repeat(200), distance: 'B'.repeat(200) },
    { name: '<em>Libellé public</em>', distance: '<b>200m</b>' },
  ];
  rows[0].nearby_commerce = nearby;
  const deps = source(rows), env = await prepareCatalogueBuild(production(), folder, deps);
  const catalogue = JSON.parse(await readFile(catalogueAliases(env, folder)['@catalogue-public'], 'utf8'));
  assert.equal(deps.calls.length, 2); assert.deepEqual(catalogue.properties[0].nearby_commerce, nearby);
  assert.equal(catalogue.properties.length, 97);
});

test('invalid environment labels fail before writing an artifact', async t => {
  const folder = await scratch(t);
  const invalid = [null, 200, true, {}, [], 'x'.repeat(201), '\u0000', '\t', '\n', '\r', '\u007f', '\u0085', '\u061c', '\u200e', '\u200f', '\u202e', '\u2066'];
  for (const key of ['name', 'distance']) {
    for (const value of invalid) {
      const rows = sourceRows(); rows[0].nearby_commerce = [{ name: 'Pharmacie', distance: '200m', [key]: value }];
      await assert.rejects(prepareCatalogueBuild(production(), folder, source(rows)), /invalid (?:text|environment text)/);
      assert.deepEqual(await readdir(folder), []);
    }
  }
});

test('failed, truncated, oversized, malformed and inconsistent sources preserve previous artifacts and never start a renderer', async t => {
  const folder = await scratch(t), prior = join(folder, 'previous-deployment.txt'); await writeFile(prior, 'prior97');
  const rows = sourceRows();
  const priorEnv = await prepareCatalogueBuild(production(), folder, source(rows)), priorPaths = catalogueAliases(priorEnv, folder);
  const publicFiles = ['@catalogue-public', '@catalogue-facts', '@catalogue-approval'].map(key => priorPaths[key]);
  const priorFiles = await Promise.all(publicFiles.map(path => readFile(path, 'utf8')));
  const priorDirectories = await readdir(join(folder, '.catalogue-build'));
  const invalid = structuredClone(rows); invalid[0].price = -1;
  const deleted = structuredClone(rows); deleted[0].deleted_at = capturedAt;
  const unpublished = structuredClone(rows); unpublished[0].is_public = false;
  const cases = [
    source(rows, { properties: () => new Response('unavailable', { status: 503 }) }),
    source(rows, { properties: () => new Response('forbidden', { status: 403 }) }),
    source(rows, { properties: () => { throw new Error('fixture timeout'); } }),
    source(rows, { properties: () => response(rows.slice(0, 20), 97) }),
    source(rows, { properties: () => response(rows, 1001) }),
    source(rows, { properties: () => new Response('[]', { headers: { 'content-type': 'application/json', 'content-range': '*/*' } }) }),
    source(rows, { properties: () => new Response('{', { headers: { 'content-type': 'application/json', 'content-range': '0-96/97' } }) }),
    source(rows, { properties: () => new Response(' '.repeat(8 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json', 'content-range': '0-96/97' } }) }),
    source(invalid), source(deleted), source(unpublished), source(rows, { geo: () => response(sourceZones(rows).slice(0, 1), 40) }),
    source(rows, { geo: () => new Response('failed', { status: 500 }) }),
    source(rows, { geo: () => response([{ id: rows[0].id, center_lat: 0, center_lng: 0, radius_m: 0 }]) }),
  ];
  for (const deps of cases) {
    await assert.rejects(prepareCatalogueBuild(production(), folder, deps));
    assert.ok(deps.calls.length <= 2); assert.equal(await readFile(prior, 'utf8'), 'prior97');
    assert.deepEqual(await readdir(join(folder, '.catalogue-build')), priorDirectories);
    assert.deepEqual(await Promise.all(publicFiles.map(path => readFile(path, 'utf8'))), priorFiles);
  }
});

test('an older geo view cannot resurrect a withdrawn property', async t => {
  const folder = await scratch(t), rows = sourceRows(), removed = rows.shift();
  const deps = source(rows, { geo: () => response([...sourceZones(rows), { id: removed.id, center_lat: 14, center_lng: -17, radius_m: 500 }]) });
  const env = await prepareCatalogueBuild(production(), folder, deps), aliases = catalogueAliases(env, folder);
  assert.ok(!JSON.parse(await readFile(aliases['@catalogue-public'], 'utf8')).properties.some(row => row.id === removed.id));
});

test('new artifacts coarsen a legacy view centre and never retain its more precise coordinate', async t => {
  const folder = await scratch(t), rows = sourceRows();
  const deps = source(rows, { geo: () => response([{ id: rows[0].id, center_lat: 14.723456789, center_lng: -17.478123456, radius_m: 500 }]) });
  const env = await prepareCatalogueBuild(production(), folder, deps), aliases = catalogueAliases(env, folder);
  const text = await readFile(aliases['@catalogue-public'], 'utf8'), catalogue = JSON.parse(text);
  assert.equal(catalogue.properties[0].geo.radiusM, 1500);
  assert.ok(!text.includes('14.723456789') && !text.includes('-17.478123456'));
  assert.ok(!JSON.parse(await readFile(aliases['@catalogue-facts'], 'utf8')).listings.some(row => Object.hasOwn(row, 'geo') || Object.hasOwn(row, 'address')));
});

test('an admin key or another project cannot substitute for the existing public source', async t => {
  const folder = await scratch(t), deps = source(sourceRows());
  for (const env of [
    { ...production(), PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' },
    { ...production(), PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_forbidden' },
    { ...production(), PUBLIC_SUPABASE_ANON_KEY: 'fixture.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'ygaawqgwxlbtkcuqecxh' })).toString('base64url') + '.fixture' },
    { ...production(), PUBLIC_SUPABASE_ANON_KEY: undefined, ADMIN_SUPABASE_SERVICE_ROLE_KEY: 'never-use-this' },
  ]) await assert.rejects(prepareCatalogueBuild(env, folder, deps));
  assert.equal(deps.calls.length, 0); assert.deepEqual(await readdir(folder), []);
});

test('tampered artifacts and a mixed facts revision fail before rendering', async t => {
  const folder = await scratch(t), env = await prepareCatalogueBuild(production(), folder, source(sourceRows()));
  const aliases = catalogueAliases(env, folder), before = await readFile(aliases['@catalogue-public'], 'utf8');
  const facts = JSON.parse(await readFile(aliases['@catalogue-facts'], 'utf8')); facts.listings[0].price = 1;
  await writeFile(aliases['@catalogue-facts'], JSON.stringify(facts));
  assert.throws(() => catalogueAliases(env, folder), /hash mismatch/); assert.equal(await readFile(aliases['@catalogue-public'], 'utf8'), before);
  assert.throws(() => catalogueAliases({ ...env, CATALOGUE_ARTIFACT_DIR: '../elsewhere' }, folder));
});

const translationSecret = 'fictitious-composition-signing-key-not-a-credential';
const localizedProduction = () => ({ ...production(), LISTING_TRANSLATIONS_ENABLED: 'true', LISTING_TRANSLATION_SECRET: translationSecret });
const emptyTranslations = () => ({ version: 1, entries: {} });
const narrative = row => ({ title: row.title, commercial_message: row.commercial_message, description: row.description });
function localizedRow() {
  return { ...sourceRows()[0], title: 'Bien public fictif', commercial_message: '', description: 'Description publique fictive.' };
}
async function translationCache(row, locales = LISTING_TRANSLATION_LOCALES) {
  const text = narrative(row);
  return { version: 1, entries: { [row.reference]: { source: text, sourceHash: await hashListingText(text),
    translations: Object.fromEntries(locales.map(lang => [lang, { title: 'Fictional ' + lang,
      commercial_message: text.commercial_message.trim() ? 'Fictional message ' + lang : '', description: 'Fictional description ' + lang }])) } } };
}
function translationIO(previous = emptyTranslations()) {
  const calls = { reads: 0, requests: [], writes: [] };
  return { calls, options: {
    now: () => 1793692800000,
    readCache: async () => { calls.reads++; return structuredClone(previous); },
    writeCache: async cache => { calls.writes.push(structuredClone(cache)); },
    request: async (url, init) => {
      calls.requests.push({ url, init });
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify({ cache: await translationCache(body.property, body.languages), counts: { ready: body.languages.length, pending: 0 } }));
    },
  } };
}

test('enabled production prepares only the three narratives from the same validated public artifact before returning the renderer environment', async t => {
  const folder = await scratch(t), row = localizedRow(), deps = source([row]), io = translationIO();
  row.attributes = { privateOwner: 'never translate' }; row.gps = 'never translate';
  const input = poisonCredentials(localizedProduction(), ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY']);
  const env = await prepareCatalogueBuild(input, folder, { ...deps, translations: io.options });
  assert.equal(deps.calls.length, 2); assert.equal(io.calls.requests.length, 1);
  assert.equal(io.calls.requests[0].url, TRANSLATION_ENDPOINT);
  assert.equal(io.calls.requests[0].init.redirect, 'error');
  const body = JSON.parse(io.calls.requests[0].init.body);
  const rendered = JSON.parse(await readFile(catalogueAliases(env, folder)['@catalogue-public'], 'utf8')).properties[0];
  assert.deepEqual(body, { mode: 'prepare', property: { reference: rendered.reference, ...narrative(rendered) }, languages: [...LISTING_TRANSLATION_LOCALES] });
  assert.equal(io.calls.writes[0].entries[row.reference].sourceHash, await hashListingText(narrative(rendered)));
  assert.deepEqual(Object.keys(io.calls.writes[0].entries[row.reference].translations), [...LISTING_TRANSLATION_LOCALES]);
  assert.equal(env.LISTING_TRANSLATION_SECRET, undefined);
  for (const key of ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY']) assert.equal(env[key], '');
});

test('local, preview and disabled production never read the translation secret or translation I/O', async t => {
  for (const input of [
    { LISTING_TRANSLATIONS_ENABLED: 'true' },
    { ...production(), CF_PAGES_BRANCH: 'preview', CATALOGUE_BUILD_SOURCE: undefined, LISTING_TRANSLATIONS_ENABLED: 'true' },
    { ...production(), LISTING_TRANSLATIONS_ENABLED: 'false' },
  ]) {
    const folder = input.CF_PAGES_BRANCH === 'main' ? await scratch(t) : root;
    const deps = source([localizedRow()]);
    Object.defineProperty(input, 'LISTING_TRANSLATION_SECRET', { enumerable: true, get() { throw new Error('Secret was read'); } });
    const forbidden = () => { throw new Error('Translation I/O forbidden'); };
    const env = await prepareCatalogueBuild(input, folder, { ...deps, translations: { readCache: forbidden, writeCache: forbidden, request: forbidden } });
    assert.equal(env.LISTING_TRANSLATION_SECRET, undefined);
    assert.equal(deps.calls.length, input.CF_PAGES_BRANCH === 'main' ? 2 : 0);
  }
});

test('composed build preserves exact-source cache on repricing and invalidates each changed narrative', async t => {
  const old = localizedRow(), previous = await translationCache(old);
  for (const change of [{ price: old.price + 1 }, { title: old.title + ' ' }, { commercial_message: 'Nouvelle accroche' }, { description: old.description + ' ' }]) {
    const folder = await scratch(t), row = { ...old, ...change }, io = translationIO(previous);
    await prepareCatalogueBuild(localizedProduction(), folder, { ...source([row]), translations: io.options });
    const textChanged = !Object.hasOwn(change, 'price');
    assert.equal(io.calls.requests.length, textChanged ? 1 : 0);
    assert.equal(io.calls.writes.length, textChanged ? 1 : 0);
    if (textChanged) {
      assert.deepEqual(JSON.parse(io.calls.requests[0].init.body).property, { reference: row.reference, ...narrative(row) });
      assert.equal(io.calls.writes[0].entries[row.reference].sourceHash, await hashListingText(narrative(row)));
    }
  }
});

test('translation transport, forged source or missing secret refuses the composed build without publishing a cache', async t => {
  const row = localizedRow();
  for (const failure of ['transport', 'source', 'secret']) {
    const folder = await scratch(t), io = translationIO(), input = localizedProduction();
    if (failure === 'secret') delete input.LISTING_TRANSLATION_SECRET;
    io.options.request = async () => {
      if (failure === 'transport') return new Response('{}', { status: 503 });
      const cache = await translationCache(row); cache.entries[row.reference].sourceHash = '0'.repeat(64);
      return new Response(JSON.stringify({ cache, counts: { ready: 5, pending: 0 } }));
    };
    await assert.rejects(prepareCatalogueBuild(input, folder, { ...source([row]), translations: io.options }));
    assert.equal(io.calls.writes.length, 0);
  }
});

test('a refused public catalogue never reaches translation preparation; honest pending retains French and unchanged cache', async t => {
  const row = localizedRow(), failed = translationIO(), invalidFolder = await scratch(t);
  await assert.rejects(prepareCatalogueBuild(localizedProduction(), invalidFolder, {
    ...source([row], { properties: () => response([row], 2) }), translations: failed.options,
  }));
  assert.deepEqual(failed.calls, { reads: 0, requests: [], writes: [] });
  const previous = await translationCache(row, ['en']), io = translationIO(previous), folder = await scratch(t);
  io.options.request = async () => new Response(JSON.stringify({ cache: emptyTranslations(), counts: { ready: 0, pending: 4 } }));
  const env = await prepareCatalogueBuild(localizedProduction(), folder, { ...source([row]), translations: io.options });
  const rendered = JSON.parse(await readFile(catalogueAliases(env, folder)['@catalogue-public'], 'utf8')).properties[0];
  assert.deepEqual(narrative(rendered), narrative(row)); assert.equal(io.calls.writes.length, 0);
  assert.deepEqual(Object.keys(previous.entries[row.reference].translations), ['en']);
});
