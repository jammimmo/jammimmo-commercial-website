import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const origin = 'http://127.0.0.1:4240';
export const tuples = Object.freeze({
  desktop: { flow: 'normal', lang: 'fr', browserName: 'chromium', width: 1366, height: 850, mobile: false, path: '/trouver-mon-bien/' },
  portrait: { flow: 'errors-back-normal', lang: 'fr', browserName: 'webkit', width: 390, height: 844, mobile: true, path: '/contact/' },
  landscape: { flow: 'unknown-recover', lang: 'fr', browserName: 'webkit', width: 844, height: 390, mobile: true, path: '/contact/' },
});

// Exactly five task parameters. No default selects every browser or flow.
export function selection() {
  const profile = process.env.QUAL_QA_PROFILE;
  const tuple = typeof profile === 'string' && Object.prototype.hasOwnProperty.call(tuples, profile) ? tuples[profile] : undefined;
  if (!tuple || process.env.QUAL_QA_FLOW !== tuple.flow || process.env.QUAL_QA_LANG !== tuple.lang)
    throw new Error('Select one closed public qualification tuple: profile/flow/lang.');
  const output = process.env.QUAL_QA_OUTPUT;
  const artifactRoot = fileURLToPath(new URL('../../../../artifacts/commercial/next-public-qualification-20261103/public-qa/', import.meta.url));
  const child = output && relative(artifactRoot, resolve(output));
  if (!output || !isAbsolute(output) || !child || child.startsWith('..') || isAbsolute(child))
    throw new Error('QUAL_QA_OUTPUT must be a dedicated directory beneath this task public-qa artifact root.');
  const provenance = process.env.QUAL_QA_PROVENANCE;
  const pinBytes = readFileSync(new URL('./source-pins.json', import.meta.url));
  if (!/^[a-f0-9]{64}$/.test(provenance ?? '') || createHash('sha256').update(pinBytes).digest('hex') !== provenance)
    throw new Error('QUAL_QA_PROVENANCE must identify the frozen source-pins.json.');
  const pins = JSON.parse(pinBytes.toString('utf8'));
  for (const [path, expected] of Object.entries(pins)) {
    if (createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') !== expected)
      throw new Error('Frozen public QA source changed: ' + path);
  }
  return { ...tuple, profile, output: resolve(output), provenance, pins };
}
