import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { catalogueBuildEnvironment, pagesLiveBuildInput, prepareCatalogueBuild, SNAPSHOT_SOURCE, SNAPSHOT_SHA256 } from './build-approved-catalogue.mjs';
import { catalogueBuildMode } from './catalogue-artifact.mjs';

test('a new Pages preview without configured variables uses the approved capture and cannot inherit database credentials', () => {
  const input = { ADMIN_SUPABASE_URL: 'fixture-url', ADMIN_SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', ADMIN_SUPABASE_ANON_KEY: 'fixture-anon', PATH: 'fixture-path' };
  const result = catalogueBuildEnvironment(input);
  assert.equal(result.CATALOGUE_BUILD_SOURCE, SNAPSHOT_SOURCE);
  assert.equal(result.CATALOGUE_SNAPSHOT_SHA256, SNAPSHOT_SHA256);
  for (const name of ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY']) assert.equal(result[name], '');
  assert.equal(result.PATH, input.PATH);
  assert.equal(input.ADMIN_SUPABASE_SERVICE_ROLE_KEY, 'fixture-key');
});

test('an explicitly approved local build keeps the captured catalogue', () => {
  const result = catalogueBuildEnvironment({ CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE, CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 });
  assert.equal(result.CATALOGUE_BUILD_SOURCE, SNAPSHOT_SOURCE);
  assert.equal(result.CATALOGUE_SNAPSHOT_SHA256, SNAPSHOT_SHA256);
});

test('partial, misspelled or mismatched approvals fail before a child build starts', () => {
  for (const input of [
    { CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 },
    { CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE },
    { CATALOGUE_BUILD_SOURCE: 'live', CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 },
    { CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE, CATALOGUE_SNAPSHOT_SHA256: '0'.repeat(64) },
  ]) assert.throws(() => catalogueBuildEnvironment(input));
});

const production = {
  CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_COMMIT_SHA: '1'.repeat(40),
  CF_PAGES_URL: 'https://synthetic-build.jammimmo-vitrine.pages.dev',
};
const legacy = { CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE, CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 };
const readProfile = () => readFile(new URL('./pages-live-catalogue-source.json', import.meta.url), 'utf8');

test('the explicit Pages live entry recognizes the exact retired pair and leaves the ordinary build strict', async () => {
  const input = { ...production, ...legacy, PATH: 'fixture-path' };
  Object.defineProperty(input, 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', {
    enumerable: true, get: () => { throw new Error('Unexpected admin read'); },
  });
  const normalized = await pagesLiveBuildInput(input);
  assert.equal(catalogueBuildMode(normalized), 'trusted-production');
  assert.equal(normalized.CATALOGUE_SNAPSHOT_SHA256, undefined);
  assert.equal(normalized.PATH, 'fixture-path');
  assert.equal(normalized.ADMIN_SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(input.CATALOGUE_BUILD_SOURCE, SNAPSHOT_SOURCE);
  assert.equal(input.CATALOGUE_SNAPSHOT_SHA256, SNAPSHOT_SHA256);
  await assert.rejects(prepareCatalogueBuild(input, '.', { fetcher: () => { throw new Error('Unexpected source read'); } }), /frozen production build is refused/);
});

test('the explicit entry accepts clean production and an already matching public source', async () => {
  const profile = JSON.parse(await readProfile());
  const claims = JSON.parse(Buffer.from(profile.anonKey.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.role, 'anon');
  assert.equal(claims.ref, 'ygaawqgwxlbtkcuqecxh');
  for (const input of [production, { ...production, CATALOGUE_BUILD_SOURCE: 'trusted-production',
    PUBLIC_SUPABASE_URL: profile.url, PUBLIC_SUPABASE_ANON_KEY: profile.anonKey }]) {
    const normalized = await pagesLiveBuildInput(input);
    assert.equal(catalogueBuildMode(normalized), 'trusted-production');
    assert.ok(normalized.PUBLIC_SUPABASE_URL === profile.url && normalized.PUBLIC_SUPABASE_ANON_KEY === profile.anonKey);
  }
});

test('the explicit entry passes a fresh artifact and no database credentials to the renderer', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jamm-pages-live-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = await pagesLiveBuildInput({ ...production, ...legacy });
  const calls = [];
  const env = await prepareCatalogueBuild(input, directory, { fetcher: async (url, request) => {
    calls.push(url.pathname);
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'error');
    assert.ok(request.headers.apikey === input.PUBLIC_SUPABASE_ANON_KEY);
    return new Response('[]', { headers: { 'content-type': 'application/json', 'content-range': '*/0' } });
  } });
  assert.deepEqual(calls, ['/rest/v1/properties', '/rest/v1/properties_public_geo']);
  assert.equal(env.CATALOGUE_BUILD_SOURCE, 'prepared-production');
  assert.equal(env.CATALOGUE_SNAPSHOT_SHA256, undefined);
  assert.equal(env.PUBLIC_SUPABASE_URL, '');
  assert.ok(env.PUBLIC_SUPABASE_ANON_KEY === '');
  assert.ok(env.ADMIN_SUPABASE_SERVICE_ROLE_KEY === '');
});

test('invalid context and conflicting settings fail before reading the public source profile', async () => {
  const unreadable = () => { throw new Error('Unexpected profile read'); };
  for (const [input, error] of [
    [{}, /requires the production project and branch/],
    [{ ...production, CF_PAGES_BRANCH: 'feature/preview' }, /requires the production project and branch/],
    [{ ...production, CF_PAGES_URL: 'https://unexpected.example.invalid' }, /Unknown Pages project/],
    [{ ...production, CF_PAGES_COMMIT_SHA: 'unverified' }, /Missing Pages commit/],
    [{ ...production, CATALOGUE_ARTIFACT_DIR: '' }, /child-only/],
    [{ ...production, CATALOGUE_ARTIFACT_SHA256: '1'.repeat(64) }, /child-only/],
    [{ ...production, CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE }, /source settings conflict/],
    [{ ...production, CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 }, /source settings conflict/],
    [{ ...production, ...legacy, CATALOGUE_SNAPSHOT_SHA256: '0'.repeat(64) }, /source settings conflict/],
    [{ ...production, CATALOGUE_BUILD_SOURCE: 'trusted-production', CATALOGUE_SNAPSHOT_SHA256: '' }, /source settings conflict/],
    [{ ...production, PUBLIC_SUPABASE_URL: 'https://ygaawqgwxlbtkcuqecxh.supabase.co' }, /Inherited public source settings conflict/],
    [{ ...production, PUBLIC_SUPABASE_URL: 'https://ygaawqgwxlbtkcuqecxh.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'fixture.invalid.key' }, /Inherited public source settings conflict/],
  ]) await assert.rejects(pagesLiveBuildInput(input, unreadable), error);
});

test('an unapproved public profile cannot populate the production input', async () => {
  const profile = JSON.parse(await readProfile());
  for (const replacement of [{ ...profile, url: 'https://unexpected.example.invalid' },
    { ...profile, anonKey: 'fixture.unapproved.key' }, { ...profile, adminKey: 'fixture-extra-key' }]) {
    await assert.rejects(pagesLiveBuildInput(production, async () => JSON.stringify(replacement)), /public source profile differs/);
  }
});
