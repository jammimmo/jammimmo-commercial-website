import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ADMIN_NAMES, catalogueBuildContext, catalogueBuildMode, childEnvironment, prepareProductionArtifact, catalogueAliases, SNAPSHOT_SOURCE, SNAPSHOT_SHA256, SOURCE_NAMES } from './catalogue-artifact.mjs';
import { validateCatalogue, validateCatalogueApproval } from '../src/lib/public-catalogue.ts';
import { preparationEnabled, prepareListingTranslations } from './prepare-listing-translations.mjs';

export { SNAPSHOT_SOURCE, SNAPSHOT_SHA256 };

const publicSourceUrl = 'https://ygaawqgwxlbtkcuqecxh.supabase.co';
// Fingerprint of the reviewed public anon key. Validate inherited values
// before opening the build-only profile or contacting Supabase.
const publicAnonKeySha256 = 'a25261b2672c7b45d0b8ffb503b5c06f1b4ba7f646eac25e8368fb08ca746e97';
const approvedSource = (url, key) => url === publicSourceUrl && typeof key === 'string'
  && createHash('sha256').update(key).digest('hex') === publicAnonKeySha256;
const readPagesLiveProfile = () => readFile(new URL('./pages-live-catalogue-source.json', import.meta.url), 'utf8');

// This entry is selected separately in the Pages project build command. It
// accepts the exact retired emergency pair once it can prove production context.
export async function pagesLiveBuildInput(input, readProfile = readPagesLiveProfile) {
  if (catalogueBuildContext(input) !== 'production') throw new Error('[catalogue build] Pages live requires the production project and branch.');
  if (input.CATALOGUE_ARTIFACT_DIR !== undefined || input.CATALOGUE_ARTIFACT_SHA256 !== undefined) {
    throw new Error('[catalogue build] Prepared artifact variables are child-only.');
  }
  const source = input.CATALOGUE_BUILD_SOURCE, snapshot = input.CATALOGUE_SNAPSHOT_SHA256;
  const retiredPair = source === SNAPSHOT_SOURCE && snapshot === SNAPSHOT_SHA256;
  if (!retiredPair && !(snapshot === undefined && (source === undefined || source === 'trusted-production'))) {
    throw new Error('[catalogue build] Pages live source settings conflict with the approved transition.');
  }
  const url = input.PUBLIC_SUPABASE_URL, key = input.PUBLIC_SUPABASE_ANON_KEY;
  if ((url !== undefined || key !== undefined) && !approvedSource(url, key)) {
    throw new Error('[catalogue build] Inherited public source settings conflict with the approved source.');
  }

  const profile = JSON.parse(await readProfile());
  if (!profile || Object.keys(profile).sort().join(',') !== 'anonKey,url' || !approvedSource(profile.url, profile.anonKey)) {
    throw new Error('[catalogue build] The reviewed Pages live public source profile differs.');
  }
  const normalized = Object.create(null);
  const replaced = new Set([...ADMIN_NAMES, ...SOURCE_NAMES, 'CATALOGUE_BUILD_SOURCE', 'CATALOGUE_SNAPSHOT_SHA256']);
  for (const name of Object.keys(input)) {
    if (!replaced.has(name)) Object.defineProperty(normalized, name, Object.getOwnPropertyDescriptor(input, name));
  }
  return Object.assign(normalized, {
    CATALOGUE_BUILD_SOURCE: 'trusted-production', PUBLIC_SUPABASE_URL: profile.url, PUBLIC_SUPABASE_ANON_KEY: profile.anonKey,
  });
}

// Local and CI builds contain no DB code path. Production has a separate, explicit
// preparation step and cannot silently publish the emergency snapshot again.
export function catalogueBuildEnvironment(input) {
  if (catalogueBuildMode(input) !== SNAPSHOT_SOURCE) throw new Error('[catalogue build] Production needs fresh preparation.');
  return childEnvironment(input, { CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE, CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256 });
}

export async function prepareCatalogueBuild(input, root, dependencies = {}) {
  const mode = catalogueBuildMode(input);
  const env = mode === SNAPSHOT_SOURCE ? catalogueBuildEnvironment(input)
    : childEnvironment(input, await prepareProductionArtifact(input, root, dependencies));
  // Validate both complete files before the renderer can start.
  const aliases = catalogueAliases(env, root);
  if (preparationEnabled(input)) {
    // Translation preparation consumes the exact validated public revision that
    // Astro will render. Never reopen a database or widen its public projection.
    await prepareListingTranslations({
      ...dependencies.translations,
      env: input,
      loadCatalogue: async () => {
        const [raw, rawApproval] = await Promise.all([
          readFile(aliases['@catalogue-public']), readFile(aliases['@catalogue-approval']),
        ]);
        if (raw.byteLength > 8 * 1024 * 1024 || rawApproval.byteLength > 8 * 1024 * 1024) throw new Error('[catalogue build] Artifact too large.');
        const approval = validateCatalogueApproval(JSON.parse(rawApproval.toString('utf8')));
        if (createHash('sha256').update(raw).digest('hex') !== approval.catalogueSha256) throw new Error('[catalogue build] Translation source hash mismatch.');
        const catalogue = validateCatalogue(JSON.parse(raw.toString('utf8')), approval.capture);
        return catalogue.properties.map(({ reference, title, commercial_message, description }) =>
          ({ reference, title, commercial_message, description }));
      },
    });
  }
  return env;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const args = process.argv.slice(2);
    const pagesLive = args[0] === '--pages-live';
    if (pagesLive) args.shift();
    const input = pagesLive ? await pagesLiveBuildInput(process.env) : process.env;
    const env = await prepareCatalogueBuild(input, root);
    console.info('[catalogue build] ' + (env.CATALOGUE_BUILD_SOURCE === SNAPSHOT_SOURCE ? 'Approved public capture: 31 October 2026.' : 'Fresh public catalogue prepared and validated.') + ' Current availability requires confirmation.');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/astro.js', import.meta.url)), 'build', ...args], { env, stdio: 'inherit' });
    child.on('error', () => { console.error('[catalogue build] Could not start the locked Astro build.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch {
    // No upstream error body, request headers or credential values in logs.
    console.error('[catalogue build] Preparation failed. Check the documented context/source/hash configuration and source health. Astro was not started; the previous deployment remains unchanged.');
    process.exitCode = 1;
  }
}
