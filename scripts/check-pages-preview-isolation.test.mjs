import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unstable_readConfig } from 'wrangler';
import { checkPagesPreviewIsolation, verifyPagesPreviewIsolation } from './check-pages-preview-isolation.mjs';

const rootConfig = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const productionId = 'b4847f4d-9c30-4996-9770-077a73e5b0c1';
const productionKv = 'e89ce8bc0c73414bb5eeca29b76a033b';

function project() {
  return {
    name: 'jammimmo-vitrine',
    production_branch: 'main',
    source: { config: { preview_deployment_setting: 'none' } },
    deployment_configs: {
      production: {
        d1_databases: { INTAKE_DB: { id: productionId } },
        kv_namespaces: { REFRESH_KV: { namespace_id: productionKv } },
      },
      preview: { env_vars: null },
    },
  };
}

test('Wrangler resolves Preview without bindings and preserves the production D1, KV, R2 and AI', () => {
  const bindings = env => {
    const config = unstable_readConfig({ config: rootConfig, env }, { hideWarnings: true });
    return { d1: config.d1_databases, kv: config.kv_namespaces, r2: config.r2_buckets, ai: config.ai };
  };
  assert.deepEqual(bindings('preview'), { d1: [], kv: [], r2: [], ai: undefined });
  assert.deepEqual(bindings('production'), bindings(undefined));
  const production = bindings('production');
  assert.equal(production.d1[0].database_id, productionId);
  assert.equal(production.kv[0].id, productionKv);
  assert.equal(production.r2[0].bucket_name, 'jammimmo-chat-private');
  assert.equal(production.ai.binding, 'AI');
});

test('the known mixed Preview fails on resource identity even under a different binding name', () => {
  for (const [field, entry, expected] of [
    ['d1_databases', { id: productionId.toUpperCase() }, /shares a production D1/],
    ['kv_namespaces', { namespace_id: productionKv }, /shares a production KV/],
  ]) {
    const configured = project();
    configured.deployment_configs.preview[field] = { UNRELATED_NAME: entry };
    assert.throws(() => verifyPagesPreviewIsolation(configured), expected);
  }
});

test('the audit requires automatic previews off and rejects missing or unexpected metadata', () => {
  const configured = project();
  assert.doesNotThrow(() => verifyPagesPreviewIsolation(configured));
  configured.source.config.preview_deployment_setting = 'all';
  assert.throws(() => verifyPagesPreviewIsolation(configured), /Automatic branch previews/);
  delete configured.source.config.preview_deployment_setting;
  assert.throws(() => verifyPagesPreviewIsolation(configured), /Automatic branch previews/);
  configured.source.config.preview_deployment_setting = 'none';
  delete configured.deployment_configs.preview.env_vars;
  assert.throws(() => verifyPagesPreviewIsolation(configured), /could not be verified/);
  delete configured.deployment_configs.production.d1_databases;
  assert.throws(() => verifyPagesPreviewIsolation(configured), /production D1/);
});

test('an unattested separate binding, Supabase variables and indirect production capabilities fail closed', () => {
  const production = project();
  const staging = {
    name: 'isolated-fixture',
    subdomain: 'isolated-fixture.pages.dev',
    deployment_configs: { production: { env_vars: null }, preview: { env_vars: {} } },
  };
  assert.doesNotThrow(() => verifyPagesPreviewIsolation(production, staging));
  const environment = staging.deployment_configs.production;
  environment.kv_namespaces = { OTHER: { namespace_id: '1'.repeat(32) } };
  assert.throws(() => verifyPagesPreviewIsolation(production, staging), /separately approved resource inventory/);
  delete environment.kv_namespaces;
  environment.env_vars = { ADMIN_SUPABASE_SERVICE_ROLE_KEY: { type: 'secret_text' } };
  assert.throws(() => verifyPagesPreviewIsolation(production, staging), /Supabase and deploy credentials/);
  environment.env_vars = { NODE_VERSION: { type: 'plain_text', value: '22.20.0' } };
  staging.deployment_configs.preview.services = { SERVICE: { service: 'estate-flow' } };
  assert.throws(() => verifyPagesPreviewIsolation(production, staging), /unapproved staging binding/);
});

test('API verification uses read-only requests and refuses absent credentials or an invalid response', async () => {
  await assert.rejects(checkPagesPreviewIsolation({ fetcher: () => assert.fail('Network forbidden') }), /Pages Read credential/);
  const input = { token: 'fixture-read-token', fetcher: (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/3f69ecd39bdecb674be8c3a20bc6d756/pages/projects/jammimmo-vitrine');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-read-token');
    return Response.json({ success: true, result: project() });
  } };
  await checkPagesPreviewIsolation(input);
  await assert.rejects(checkPagesPreviewIsolation({
    ...input, fetcher: () => new Response('provider diagnostics', { status: 403 }),
  }), error => /metadata could not be verified/.test(error.message) && !error.message.includes('provider diagnostics'));
});
