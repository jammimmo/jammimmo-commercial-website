import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalogueBuildMode, childEnvironment, prepareProductionArtifact, catalogueAliases, SNAPSHOT_SOURCE, SNAPSHOT_SHA256 } from './catalogue-artifact.mjs';
import { validateCatalogue, validateCatalogueApproval } from '../src/lib/public-catalogue.ts';
import { preparationEnabled, prepareListingTranslations } from './prepare-listing-translations.mjs';

export { SNAPSHOT_SOURCE, SNAPSHOT_SHA256 };

// Local/CI/preview contain no DB code path. Production has a separate, explicit
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
    const env = await prepareCatalogueBuild(process.env, root);
    console.info('[catalogue build] ' + (env.CATALOGUE_BUILD_SOURCE === SNAPSHOT_SOURCE ? 'Approved public capture: 31 October 2026.' : 'Fresh public catalogue prepared and validated.') + ' Current availability requires confirmation.');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/astro.js', import.meta.url)), 'build', ...process.argv.slice(2)], { env, stdio: 'inherit' });
    child.on('error', () => { console.error('[catalogue build] Could not start the locked Astro build.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch {
    // No upstream error body, request headers or credential values in logs.
    console.error('[catalogue build] Preparation failed. Check the documented context/source/hash configuration and source health. Astro was not started; the previous deployment remains unchanged.');
    process.exitCode = 1;
  }
}
