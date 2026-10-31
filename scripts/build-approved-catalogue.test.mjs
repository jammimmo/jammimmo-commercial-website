import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { catalogueBuildEnvironment, SNAPSHOT_SOURCE, SNAPSHOT_SHA256 } from './build-approved-catalogue.mjs';

test('a new Pages preview without configured variables uses the approved capture and cannot inherit database credentials', () => {
  const input = { ADMIN_SUPABASE_URL: 'fixture-url', ADMIN_SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', ADMIN_SUPABASE_ANON_KEY: 'fixture-anon', PATH: 'fixture-path' };
  const result = catalogueBuildEnvironment(input);
  assert.equal(result.CATALOGUE_BUILD_SOURCE, SNAPSHOT_SOURCE);
  assert.equal(result.CATALOGUE_SNAPSHOT_SHA256, SNAPSHOT_SHA256);
  for (const name of ['ADMIN_SUPABASE_URL', 'ADMIN_SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SUPABASE_ANON_KEY']) assert.equal(result[name], '');
  assert.equal(result.PATH, input.PATH);
  assert.equal(input.ADMIN_SUPABASE_SERVICE_ROLE_KEY, 'fixture-key');
});

test('an explicitly approved production build keeps the same captured catalogue', () => {
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
