import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SNAPSHOT_SOURCE = 'public-snapshot-20261031';
export const SNAPSHOT_SHA256 = '60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb';

// Pages builds preview branches before an operator can configure their runtime.
// Until the database recovery is qualified, every normal build must use the
// already published catalogue, including previews. Never silently try the DB.
export function catalogueBuildEnvironment(input) {
  const source = input.CATALOGUE_BUILD_SOURCE;
  const hash = input.CATALOGUE_SNAPSHOT_SHA256;
  if (source === undefined && hash !== undefined) throw new Error('Catalogue build source is required with its hash.');
  if (source !== undefined && (source !== SNAPSHOT_SOURCE || hash !== SNAPSHOT_SHA256)) {
    throw new Error('Catalogue build approval does not match the reviewed snapshot.');
  }
  return {
    ...input,
    CATALOGUE_BUILD_SOURCE: SNAPSHOT_SOURCE,
    CATALOGUE_SNAPSHOT_SHA256: SNAPSHOT_SHA256,
    ADMIN_SUPABASE_URL: '',
    ADMIN_SUPABASE_SERVICE_ROLE_KEY: '',
    ADMIN_SUPABASE_ANON_KEY: '',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const env = catalogueBuildEnvironment(process.env);
    console.info('[catalogue build] Approved public capture: 31 October 2026; current availability requires confirmation.');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/astro.js', import.meta.url)), 'build', ...process.argv.slice(2)], { env, stdio: 'inherit' });
    child.on('error', () => { console.error('[catalogue build] Could not start the locked Astro build.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch {
    console.error('[catalogue build] The source/hash approval is invalid; no build or database access started.');
    process.exitCode = 1;
  }
}
