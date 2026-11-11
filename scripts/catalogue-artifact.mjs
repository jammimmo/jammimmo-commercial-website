// Build preparation only. Never imported by the browser or Worker.
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { MAX_CATALOGUE_PROPERTIES, propertyCanonicalUrl, validateCatalogue, validatePropertyFacts, validateCatalogueApproval, validateCataloguePair } from '../src/lib/public-catalogue.ts';
import { approximatePropertyCenter, PREPARED_PUBLIC_ZONE_RADIUS_M } from '../src/lib/public-geo.ts';

export const SNAPSHOT_SOURCE = 'public-snapshot-20261031';
export const SNAPSHOT_SHA256 = '60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb';
export const FACTS_SHA256 = '880983b46ceafa034130abab5183eba239d3cab65c4f704a8bfbb2a025ae0ea2';
export const ADMIN_NAMES = ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY'];
export const SOURCE_NAMES = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];
const ORIGIN = 'https://ygaawqgwxlbtkcuqecxh.supabase.co';
const MAX_BYTES = 8 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const encoded = value => JSON.stringify(value) + '\n';
const requireValue = (value, message) => { if (!value) throw new Error('[catalogue build] ' + message); };

/** Metadata is an error detector, not an authorization boundary for hostile code.
 * Preview secrets must be absent in Pages settings BEFORE checkout/install. */
export function catalogueBuildContext(env) {
  const pages = env.CF_PAGES;
  const metadata = ['CF_PAGES_BRANCH', 'CF_PAGES_COMMIT_SHA', 'CF_PAGES_URL'];
  if (pages === undefined) {
    requireValue(metadata.every(name => env[name] === undefined), 'Ambiguous Pages context.');
    return 'local';
  }
  requireValue(pages === '1', 'Unknown Pages context.');
  requireValue(typeof env.CF_PAGES_BRANCH === 'string' && env.CF_PAGES_BRANCH.trim().length > 0 && env.CF_PAGES_BRANCH.length <= 200, 'Missing Pages branch.');
  requireValue(/^[a-f0-9]{40}$/.test(env.CF_PAGES_COMMIT_SHA ?? ''), 'Missing Pages commit.');
  const url = env.CF_PAGES_URL;
  requireValue(typeof url === 'string' && url.length > 0, 'Missing Pages deployment URL.');
  requireValue(/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.jammimmo-vitrine\.pages\.dev\/?$/.test(url),
    'Unknown Pages project or invalid deployment URL.');
  return env.CF_PAGES_BRANCH === 'main' ? 'production' : 'preview';
}

export function catalogueBuildMode(env) {
  const context = catalogueBuildContext(env);
  requireValue(context !== 'preview', 'Hosted previews are disabled on the production Pages project.');
  // Reject supplied child-only paths even locally. A caller cannot promote a
  // previously generated artifact by bypassing the fresh-source preparation.
  requireValue(env.CATALOGUE_ARTIFACT_DIR === undefined && env.CATALOGUE_ARTIFACT_SHA256 === undefined, 'Prepared artifact variables are child-only.');
  if (context === 'production') {
    requireValue(env.CATALOGUE_BUILD_SOURCE === 'trusted-production' && env.CATALOGUE_SNAPSHOT_SHA256 === undefined,
      'Production requires CATALOGUE_BUILD_SOURCE=trusted-production and removal of CATALOGUE_SNAPSHOT_SHA256. A frozen production build is refused.');
    return 'trusted-production';
  }
  requireValue((env.CATALOGUE_BUILD_SOURCE === undefined && env.CATALOGUE_SNAPSHOT_SHA256 === undefined)
    || (env.CATALOGUE_BUILD_SOURCE === SNAPSHOT_SOURCE && env.CATALOGUE_SNAPSHOT_SHA256 === SNAPSHOT_SHA256), 'Snapshot approval mismatch outside production.');
  return SNAPSHOT_SOURCE;
}

export function childEnvironment(input, selection = {}) {
  // Do not read credential values even from accessors in preview/local tests.
  const child = {};
  for (const key of Object.keys(input)) if (!ADMIN_NAMES.includes(key) && !SOURCE_NAMES.includes(key)
    && key !== 'LISTING_TRANSLATION_SECRET' && !key.startsWith('CATALOGUE_')) child[key] = input[key];
  for (const name of ADMIN_NAMES) child[name] = '';
  for (const name of SOURCE_NAMES) child[name] = '';
  return { ...child, ...selection };
}

// Existing anon grants: migration20261023164421_anonymous_catalogue_containment.
// Address and attributes (including JSON paths) are NOT allowed. No fallback to
// service_role, another view, raw bags, owner prices, documents or exact GPS.
const PROPERTY_KEYS = ['id', 'reference', 'title', 'type', 'transaction_type', 'status', 'city', 'quartier', 'price', 'negotiable', 'commercial_message', 'surface', 'bedrooms', 'images', 'video_links', 'commodities', 'nearby_commerce', 'flux_passage', 'tags', 'description', 'published_at', 'updated_at'];
export const PROPERTY_SELECT = [...PROPERTY_KEYS, 'is_public', 'deleted_at'].join(',');
const COMMODITY_FEATURES = Object.freeze({ Climatisation: 'climatisation', Ascenseur: 'ascenseur', Piscine: 'piscine', Jardin: 'jardin', Terrasse: 'terrasse' });

function publicReadKey(key) {
  requireValue(typeof key === 'string' && key.length > 0 && !/[\r\n]/.test(key), 'Existing public read key is missing.');
  // Guard accidental service-role/secret substitution before any request. The
  // server still verifies the signature and applies RLS; this is not JWT auth.
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) return key;
  let claims; try { const parts = key.split('.'); requireValue(parts.length === 3, 'Invalid public key.'); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new Error('[catalogue build] Invalid public read key.'); }
  requireValue(claims.role === 'anon' && claims.ref === 'ygaawqgwxlbtkcuqecxh', 'Only this project public anon key is permitted.');
  return key;
}

async function boundedBody(response) {
  requireValue(response.body, 'Source body missing.');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; requireValue(size <= MAX_BYTES, 'Source byte limit exceeded.'); chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function readRows(fetcher, key, table, select, signal) {
  const url = new URL('/rest/v1/' + table, ORIGIN);
  url.searchParams.set('select', select); url.searchParams.set('order', 'id.asc'); url.searchParams.set('limit', String(MAX_CATALOGUE_PROPERTIES));
  if (table === 'properties') { url.searchParams.set('is_public', 'eq.true'); url.searchParams.set('status', 'eq.Disponible'); url.searchParams.set('deleted_at', 'is.null'); }
  const response = await fetcher(url, { method: 'GET', redirect: 'error', signal,
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json', Prefer: 'count=exact' } });
  requireValue(response.status === 200 || response.status === 206, 'Catalogue source failed (' + response.status + ').');
  requireValue(response.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'Unexpected source content type.');
  // A count of null, *, or a truncated range is never an empty catalogue.
  const range = response.headers.get('content-range') ?? '';
  const rows = JSON.parse(await boundedBody(response));
  requireValue(Array.isArray(rows) && rows.length <= MAX_CATALOGUE_PROPERTIES, 'Invalid source rows.');
  const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(range);
  requireValue(match && Number(match[3]) === rows.length && (rows.length === 0 ? match[1] === undefined : Number(match[1]) === 0 && Number(match[2]) === rows.length - 1), 'Missing exact count or truncated source.');
  requireValue(new Set(rows.map(row => row?.id)).size === rows.length, 'Duplicate source rows.');
  return rows;
}

export function projectProductionCatalogue(rows, zones, capturedAt, approvedExtras) {
  requireValue(Array.isArray(rows) && rows.length <= MAX_CATALOGUE_PROPERTIES && Array.isArray(zones), 'Invalid source collection.');
  const ids = new Set(rows.map(row => row.id)), geo = new Map();
  const seenZones = new Set();
  for (const zone of zones) {
    requireValue(zone && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(zone.id) && !seenZones.has(zone.id) && zone.radius_m === 500
      && typeof zone.center_lat === 'number' && Number.isFinite(zone.center_lat) && Math.abs(zone.center_lat) <= 90
      && typeof zone.center_lng === 'number' && Number.isFinite(zone.center_lng) && Math.abs(zone.center_lng) <= 180, 'Invalid public geography.');
    seenZones.add(zone.id);
    const coarse = approximatePropertyCenter(zone.center_lat, zone.center_lng);
    requireValue(coarse, 'Public geography outside the existing approximate-map contract.');
    // An older authorized view can still include soft-deleted rows. Only join
    // the freshly selected eligible UUIDs; extra zones never resurrect a row.
    if (ids.has(zone.id)) geo.set(zone.id, { centerLat: coarse.lat, centerLng: coarse.lng, radiusM: PREPARED_PUBLIC_ZONE_RADIUS_M });
  }
  const previous = new Map((approvedExtras ? validateCatalogue(approvedExtras).properties : []).map(row => [row.id, row]));
  const properties = [], listings = [], hrefByRef = {};
  for (const row of rows) {
    requireValue(row && typeof row === 'object' && row.status === 'Disponible' && row.is_public === true && row.deleted_at === null, 'Unexpected publication state.');
    requireValue(PROPERTY_KEYS.every(key => Object.hasOwn(row, key)), 'Incomplete public row.');
    const property = Object.fromEntries(PROPERTY_KEYS.map(key => [key, row[key]]));
    // Nullable legacy fields retain their historical public defaults only.
    for (const key of ['city', 'quartier', 'commercial_message', 'description']) property[key] ??= '';
    for (const key of ['images', 'video_links', 'commodities', 'nearby_commerce', 'tags']) property[key] ??= [];
    property.address = null; property.flux_passage ??= null; property.published_at ??= null;
    property.geo = geo.get(row.id) ?? null;
    // Optional legacy extras only for an unchanged, freshly returned row. Full
    // timestamp strings retain microseconds; Date.parse would weaken this gate.
    const old = previous.get(row.id);
    const unchanged = old && PROPERTY_KEYS.every(key => Object.hasOwn(row, key) && JSON.stringify(row[key]) === JSON.stringify(old[key]));
    property.attributes = unchanged ? { ...old.attributes } : {};
    const extrasCapturedAt = unchanged && Object.keys(property.attributes).length ? approvedExtras.capture.capturedAt : null;
    for (const [commodity, feature] of Object.entries(COMMODITY_FEATURES)) {
      if (Array.isArray(property.commodities) && property.commodities.includes(commodity)) property.attributes[feature] = true;
    }
    // Positive commodity evidence does not imply false for an absent amenity.
    // No period can be reconstructed from the public-only monetary columns.
    // Never preserve arbitrary members of nested arrays/objects.
    requireValue(Array.isArray(property.nearby_commerce), 'Invalid public environment.');
    property.nearby_commerce = property.nearby_commerce.map(item => ({ name: item?.name, distance: item?.distance }));
    property.documents = {};
    const url = propertyCanonicalUrl(property.reference); hrefByRef[property.reference] = url;
    properties.push(property);
    const fact = Object.fromEntries(['id', 'reference', 'title', 'type', 'transaction_type', 'city', 'quartier', 'price', 'surface', 'bedrooms', 'negotiable', 'description'].map(key => [key, property[key]]));
    listings.push({ ...fact, url, features: property.attributes, rentalPeriod: null, extrasCapturedAt });
  }
  const capture = { url: 'https://jammimmo.com/biens/', capturedAt,
    // Content revision covers public data only, not secret/raw DB responses.
    sha256: hash(encoded({ properties, listings })), listingCount: properties.length };
  const catalogue = validateCatalogue({ schemaVersion: 1, capture, properties, hrefByRef }, capture);
  const facts = validatePropertyFacts({ schemaVersion: 1, capture, listings }, capture);
  validateCataloguePair(catalogue, facts);
  const catalogueText = encoded(catalogue), factsText = encoded(facts);
  const approval = validateCatalogueApproval({ schemaVersion: 1, source: 'trusted-production', capture, catalogueSha256: hash(catalogueText), factsSha256: hash(factsText) });
  return { catalogueText, factsText, approvalText: encoded(approval) };
}

export async function prepareProductionArtifact(env, root, { fetcher = globalThis.fetch, now = () => new Date().toISOString() } = {}) {
  requireValue(catalogueBuildMode(env) === 'trusted-production', 'Production preparation is forbidden in this context.');
  // Only now may trusted production read the two EXISTING public settings.
  // ADMIN_* are never consulted. RLS and column privileges remain authoritative.
  requireValue(env.PUBLIC_SUPABASE_URL === ORIGIN || env.PUBLIC_SUPABASE_URL === ORIGIN + '/', 'Unexpected public project.');
  const key = publicReadKey(env.PUBLIC_SUPABASE_ANON_KEY);
  const approvedText = await readFile(new URL('../src/data/public-catalogue-20261031.json', import.meta.url), 'utf8');
  requireValue(hash(approvedText) === SNAPSHOT_SHA256, 'Approved extras capture hash mismatch.');
  const approvedExtras = validateCatalogue(JSON.parse(approvedText));
  const signal = AbortSignal.timeout(15000);
  const rows = await readRows(fetcher, key, 'properties', PROPERTY_SELECT, signal);
  const zones = await readRows(fetcher, key, 'properties_public_geo', 'id,center_lat,center_lng,radius_m', signal);
  const artifact = projectProductionCatalogue(rows, zones, now(), approvedExtras);
  // Build into a new owned directory only AFTER validation. Never replace the
  // approved snapshot or a previous revision, including after failed reads.
  const base = resolve(root, '.catalogue-build'); await mkdir(base, { recursive: true });
  const digest = hash(artifact.approvalText), target = join(base, digest), stage = await mkdtemp(join(base, '.preparing-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(stage, 'catalogue.json'), artifact.catalogueText, { flag: 'wx', mode: 0o600 });
    await writeFile(join(stage, 'facts.json'), artifact.factsText, { flag: 'wx', mode: 0o600 });
    await writeFile(join(stage, 'approval.json'), artifact.approvalText, { flag: 'wx', mode: 0o600 });
    try { await rename(stage, target); }
    catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
      for (const [file, content] of [['catalogue.json', artifact.catalogueText], ['facts.json', artifact.factsText], ['approval.json', artifact.approvalText]]) requireValue(await readFile(join(target, file), 'utf8') === content, 'Existing artifact differs.');
    }
  } finally { await rm(stage, { recursive: true, force: true }); }
  return { CATALOGUE_BUILD_SOURCE: 'prepared-production', CATALOGUE_ARTIFACT_DIR: '.catalogue-build/' + digest, CATALOGUE_ARTIFACT_SHA256: digest };
}

/** Config-time verification happens before Astro can consume any data. Paths
 * are one immutable directory; Worker aliases include facts, never catalogue. */
export function catalogueAliases(env, root) {
  const context = catalogueBuildContext(env); let paths, expectedHash;
  if (context === 'production') {
    requireValue(env.CATALOGUE_BUILD_SOURCE === 'prepared-production' && env.CATALOGUE_SNAPSHOT_SHA256 === undefined
      && /^[a-f0-9]{64}$/.test(env.CATALOGUE_ARTIFACT_SHA256 ?? '')
      && env.CATALOGUE_ARTIFACT_DIR === '.catalogue-build/' + env.CATALOGUE_ARTIFACT_SHA256, 'Production must run the fresh catalogue wrapper.');
    const base = realpathSync(resolve(root, '.catalogue-build')), directory = realpathSync(resolve(root, env.CATALOGUE_ARTIFACT_DIR));
    requireValue(directory.startsWith(base + sep), 'Artifact directory escaped its build.');
    paths = ['catalogue.json', 'facts.json', 'approval.json'].map(file => {
      const path = realpathSync(join(directory, file)); requireValue(path.startsWith(directory + sep), 'Artifact file escaped its revision.'); return path;
    });
    expectedHash = env.CATALOGUE_ARTIFACT_SHA256;
  } else {
    requireValue(catalogueBuildMode(env) === SNAPSHOT_SOURCE, 'Invalid snapshot context.');
    paths = ['public-catalogue-20261031.json', 'public-property-facts-20261031.json', 'public-catalogue-approval.json'].map(file => resolve(root, 'src/data', file));
  }
  const texts = paths.map(path => { const data = readFileSync(path); requireValue(data.byteLength <= MAX_BYTES, 'Artifact too large.'); return data.toString('utf8'); });
  if (expectedHash) requireValue(hash(texts[2]) === expectedHash, 'Artifact approval hash mismatch.');
  const approval = validateCatalogueApproval(JSON.parse(texts[2]));
  requireValue(approval.source === (context === 'production' ? 'trusted-production' : SNAPSHOT_SOURCE), 'Artifact source mismatch.');
  if (context !== 'production') requireValue(approval.catalogueSha256 === SNAPSHOT_SHA256 && approval.factsSha256 === FACTS_SHA256, 'Unapproved snapshot hashes.');
  requireValue(hash(texts[0]) === approval.catalogueSha256 && hash(texts[1]) === approval.factsSha256, 'Artifact content hash mismatch.');
  validateCataloguePair(validateCatalogue(JSON.parse(texts[0]), approval.capture), validatePropertyFacts(JSON.parse(texts[1]), approval.capture));
  // Vite5's exact aliases do not match an id with the ?raw suffix. Keep the
  // raw entry explicit; otherwise its raw loader tries to open the alias name.
  return { '@catalogue-public?raw': paths[0] + '?raw', '@catalogue-public': paths[0], '@catalogue-facts': paths[1], '@catalogue-approval': paths[2] };
}
