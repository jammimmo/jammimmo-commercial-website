/**
 * build-places.mjs — derive a SLIM, vitrine-local places catalogue from the
 * territorial referential, covering ALL of Senegal (communes + quartiers).
 *
 * ISOLATION (Tier-3): this is a BUILD-TIME helper run MANUALLY. It reads the
 * external referential (which lives OUTSIDE this repo, in ../../territorial)
 * and writes a committed copy into `src/data/senegal-places.json`. At RUNTIME
 * the bundle references ONLY `src/data/senegal-places.json` — never the source.
 * Do NOT wire this into `npm run build`: Cloudflare Pages CI does not have the
 * referential checked out, and the source changes very rarely.
 *
 * Usage:
 *   node scripts/build-places.mjs
 *   node scripts/build-places.mjs /abs/path/to/senegal-territorial.json
 *
 * Output rows are compact to keep the bundle small (~59 KB):
 *   { "n": <display name>, "c": <commune context>, "r": <region context> }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default source: sibling `territorial/` repo two levels up from this repo root.
const DEFAULT_SRC = resolve(
  __dirname,
  '..',
  '..',
  'territorial',
  'senegal-territorial.json',
);
const SRC = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SRC;
const OUT = resolve(__dirname, '..', 'src', 'data', 'senegal-places.json');

const tree = JSON.parse(readFileSync(SRC, 'utf8'));

/** Flatten the recursive tree, keeping only commune + quartier nodes with
 *  inherited region/commune context. Skips the single synthetic orphan
 *  quartier (a "Thiès — Escale …" label with no parent commune). */
const rows = [];
let skipped = 0;
function walk(node, ctx) {
  let region = ctx.region;
  let commune = ctx.commune;
  if (node.type === 'region') region = node.name;
  if (node.type === 'commune') commune = node.name;

  if (node.type === 'commune') {
    rows.push({ n: node.name, c: node.name, r: region ?? '' });
  } else if (node.type === 'quartier') {
    if (commune) {
      rows.push({ n: node.name, c: commune, r: region ?? '' });
    } else {
      skipped += 1; // orphan quartier without a parent commune — drop it.
    }
  }

  for (const child of node.children ?? []) {
    walk(child, { region, commune });
  }
}
walk(tree, { region: null, commune: null });

// Ajouts CURÉS (manuels), vérifiés — lieux usuels absents/ambigus du référentiel
// source. Fusionnés puis dédupliqués ci-dessous, donc sans effet s'ils existent déjà.
//  • « Almadies » : quartier résidentiel huppé (Pointe des Almadies). Le référentiel
//    n'a que « Ngor Almadies » et « Almadies Keur Massar » (autre lieu, à Keur Massar).
//    On ajoute l'entrée canonique rattachée à sa commune réelle = Ngor, région Dakar.
//    NB : Almadies n'est PAS une commune (c'est un arrondissement + un quartier de Ngor).
const CURATED_EXTRA = [{ n: 'Almadies', c: 'Ngor', r: 'Dakar' }];
for (const e of CURATED_EXTRA) rows.push(e);

// Stable, de-duplicated by (name|commune|region) to be safe.
const seen = new Set();
const deduped = [];
for (const r of rows) {
  const key = `${r.n}|${r.c}|${r.r}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(r);
}
deduped.sort((a, b) => a.n.localeCompare(b.n, 'fr') || a.c.localeCompare(b.c, 'fr'));

writeFileSync(OUT, JSON.stringify(deduped));

const communes = deduped.filter((r) => r.n === r.c).length;
const quartiers = deduped.length - communes;
console.log(`[build-places] source: ${SRC}`);
console.log(`[build-places] wrote ${deduped.length} places (${communes} communes + ${quartiers} quartiers), skipped ${skipped} orphan(s)`);
console.log(`[build-places] -> ${OUT}`);
