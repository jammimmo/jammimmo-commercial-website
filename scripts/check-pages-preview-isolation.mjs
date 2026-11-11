import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const account = '3f69ecd39bdecb674be8c3a20bc6d756';
const productionProject = 'jammimmo-vitrine';
const projectName = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const namespaceId = /^[a-f0-9]{32}$/i;
const resourceClasses = [
  { key: 'd1_databases', label: 'D1', idField: 'id', format: uuid, binding: 'INTAKE_DB',
    productionId: 'b4847f4d-9c30-4996-9770-077a73e5b0c1' },
  { key: 'kv_namespaces', label: 'KV', idField: 'namespace_id', format: namespaceId, binding: 'REFRESH_KV',
    productionId: 'e89ce8bc0c73414bb5eeca29b76a033b' },
];
const environmentMetadata = new Set([
  'always_use_latest_compatibility_date', 'build_image_major_version', 'compatibility_date',
  'compatibility_flags', 'usage_model', 'limits', 'placement', 'build_cache', 'fail_open',
  'wrangler_config_hash',
]);
const approvedBuildVariables = new Map([
  ['NODE_VERSION', /^22\.20\.0$/],
  ['PNPM_VERSION', /^9\.0\.0$/],
  ['CATALOGUE_BUILD_SOURCE', /^public-snapshot-20261031$/],
  ['CATALOGUE_SNAPSHOT_SHA256', /^60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb$/],
]);

function requireIsolation(condition, message) {
  if (!condition) throw new Error(`[Pages isolation] ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resourceIds(config, { key, label, idField, format }) {
  // Cloudflare omits optional binding classes when the environment has no binding.
  const bindings = config[key] ?? {};
  requireIsolation(isRecord(bindings), `${label} bindings are missing or invalid.`);
  return Object.values(bindings).map(binding => {
    const id = binding?.[idField];
    requireIsolation(typeof id === 'string' && format.test(id), `A ${label} resource ID is missing or invalid.`);
    return id.toLowerCase();
  });
}

function verifyProduction(project) {
  requireIsolation(project?.name === productionProject && project?.production_branch === 'main',
    'Production project or branch could not be verified.');
  requireIsolation(project?.source?.config?.preview_deployment_setting === 'none',
    'Automatic branch previews must be disabled on the production Pages project.');
  const production = project?.deployment_configs?.production;
  requireIsolation(isRecord(production), 'Production bindings could not be verified.');
  return resourceClasses.map(resource => {
    const liveIds = resourceIds(production, resource);
    requireIsolation(liveIds.includes(resource.productionId)
      && production[resource.key][resource.binding]?.[resource.idField]?.toLowerCase() === resource.productionId,
    `The expected production ${resource.label} binding could not be verified.`);
    return new Set(liveIds);
  });
}

function verifyStagingConfig(config, productionIds) {
  requireIsolation(isRecord(config) && Object.hasOwn(config, 'env_vars'),
    'Staging bindings or environment variables could not be verified.');
  for (const [key, value] of Object.entries(config)) {
    if (environmentMetadata.has(key) || key === 'env_vars' || resourceClasses.some(resource => resource.key === key)) continue;
    requireIsolation(value === null || (isRecord(value) && Object.keys(value).length === 0),
      'An unapproved staging binding or setting is present.');
  }
  const env = config.env_vars ?? {};
  requireIsolation(isRecord(env), 'Staging variables are invalid.');
  for (const [name, variable] of Object.entries(env)) {
    requireIsolation(variable?.type === 'plain_text' && typeof variable.value === 'string'
      && approvedBuildVariables.get(name)?.test(variable.value),
    'Staging has an unapproved environment variable or secret. Supabase and deploy credentials must be absent.');
  }

  resourceClasses.forEach((resource, index) => {
    const stagingIds = resourceIds(config, resource);
    requireIsolation(stagingIds.every(id => !productionIds[index].has(id)),
      `Staging shares a production ${resource.label} resource.`);
    requireIsolation(stagingIds.length === 0,
      `A staging ${resource.label} binding requires a separately approved resource inventory.`);
  });
}

export function verifyPagesPreviewIsolation(production, staging) {
  const productionIds = verifyProduction(production);
  verifyStagingConfig(production.deployment_configs?.preview, productionIds);
  if (staging === undefined) return;
  requireIsolation(typeof staging?.name === 'string' && projectName.test(staging.name) && staging.name !== productionProject
    && staging.subdomain === `${staging.name}.pages.dev`,
  'The separate staging Pages project could not be verified.');
  verifyStagingConfig(staging.deployment_configs?.production, productionIds);
  verifyStagingConfig(staging.deployment_configs?.preview, productionIds);
}

async function readProject(project, token, fetcher) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;
  let result;
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) result = await response.json();
  } catch {
    // Do not include provider error messages or response bodies in CI logs.
  }
  requireIsolation(result?.success === true && result?.result?.name === project,
    'Cloudflare project metadata could not be verified.');
  return result.result;
}

export async function checkPagesPreviewIsolation({ token, stagingProject, fetcher = fetch }) {
  requireIsolation(typeof token === 'string' && token.length > 0 && !/\s/.test(token),
    'A Cloudflare Pages Read credential is required.');
  requireIsolation(stagingProject === undefined || (typeof stagingProject === 'string'
    && projectName.test(stagingProject) && stagingProject !== productionProject),
    'Invalid separate staging project name.');
  const production = await readProject(productionProject, token, fetcher);
  verifyPagesPreviewIsolation(production);
  if (stagingProject !== undefined) {
    verifyPagesPreviewIsolation(production, await readProject(stagingProject, token, fetcher));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [option, project, ...extra] = process.argv.slice(2);
    requireIsolation(option === undefined || (option === '--staging-project' && project && extra.length === 0),
      'Usage: check-pages-preview-isolation.mjs [--staging-project NAME]');
    await checkPagesPreviewIsolation({ token: process.env.CLOUDFLARE_PAGES_READ_TOKEN, stagingProject: project });
    console.info('[Pages isolation] Cloudflare environment settings passed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[Pages isolation] verification failed.');
    process.exitCode = 1;
  }
}
