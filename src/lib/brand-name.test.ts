import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE } from './site-config';

const ROOT = process.cwd();
const OFFICIAL_NAME = 'Jamm Immo';
const RETIRED_NAME = new RegExp(
  `\\b${['Jamm', 'Immobilier'].join('\\s+')}\\b`,
  'iu',
);
const TEXT_EXTENSIONS = new Set([
  '.astro',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
]);

function activeTextFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(path, entry.name);
    const repositoryPath = relative(ROOT, absolute).replaceAll('\\', '/');

    if (
      entry.isDirectory()
      && (
        entry.name.startsWith('.')
        || entry.name === 'node_modules'
        || entry.name === 'dist'
        || /(^|\/)archive(s)?(\/|$)/iu.test(repositoryPath)
        || /(^|\/)handoffs?(\/|$)/iu.test(repositoryPath)
        || /(^|\/)qa-artifacts?(\/|$)/iu.test(repositoryPath)
      )
    ) {
      return [];
    }

    if (entry.isDirectory()) return activeTextFiles(absolute);
    return TEXT_EXTENSIONS.has(extname(entry.name)) ? [absolute] : [];
  });
}

describe('official brand name', () => {
  it('uses the exact public name in every authoritative brand source', () => {
    expect(SITE.agencyName).toBe(OFFICIAL_NAME);

    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'public/site.webmanifest'), 'utf8'),
    ) as { name?: string };
    expect(manifest.name).toBe(OFFICIAL_NAME);

    for (const lang of ['ar', 'en', 'es', 'fr', 'it', 'wo']) {
      const locale = JSON.parse(
        readFileSync(join(ROOT, `src/i18n/locales/${lang}.json`), 'utf8'),
      ) as Record<string, string>;
      expect(locale['site.name'], lang).toBe(OFFICIAL_NAME);
    }
  });

  it('does not expose the retired name on active text surfaces', () => {
    const files = [
      join(ROOT, 'README.md'),
      join(ROOT, 'package.json'),
      ...activeTextFiles(join(ROOT, 'docs')),
      ...activeTextFiles(join(ROOT, 'public')),
      ...activeTextFiles(join(ROOT, 'src')),
    ];
    const offenders = files
      .filter((file) => RETIRED_NAME.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
