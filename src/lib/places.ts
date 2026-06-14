/**
 * Nationwide places catalogue (communes + quartiers, all 14 regions of Senegal)
 * powering the /estimation autocomplete.
 *
 * SOURCE OF TRUTH AT RUNTIME = `src/data/senegal-places.json` (committed, bundled
 * at build time — same pattern as the i18n JSON imported in `src/lib/i18n.ts`,
 * with `resolveJsonModule: true`). That slim JSON is DERIVED, build-time only and
 * MANUALLY, from the external territorial referential by `scripts/build-places.mjs`.
 * No cross-repo import happens at runtime — full Tier-3 isolation.
 *
 * This is intentionally SEPARATE from `src/lib/quartiers.ts`: that file is the
 * hand-written editorial catalogue for the SEO hub pages (/immobilier/<slug>) and
 * must stay Dakar-curated. Here we only need a flat, nationwide name list for an
 * autocomplete, so we trade editorial depth for national coverage.
 */
import raw from '@/data/senegal-places.json';

/** Compact on-disk row: n = name, c = commune context, r = region context. */
interface RawPlace {
  n: string;
  c: string;
  r: string;
}

export interface Place {
  /** Display name (the value written into the field when picked). */
  name: string;
  /** Parent commune (equals `name` for commune entries). */
  commune: string;
  /** Region — used to disambiguate the ~57 colliding names nationally. */
  region: string;
}

export const PLACES: Place[] = (raw as RawPlace[]).map((p) => ({
  name: p.n,
  commune: p.c,
  region: p.r,
}));

/** Accent/case-insensitive normalization for the autocomplete filter. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Secondary label shown next to an option to disambiguate identical names.
 * "Plateau" → "Dakar-Plateau, Dakar" ; a commune → just its region.
 */
export function placeContext(p: Place): string {
  return p.commune !== p.name && p.commune ? `${p.commune}, ${p.region}` : p.region;
}

/**
 * Filter the catalogue for the autocomplete. Matches the query (≥2 chars, after
 * normalization) against the place NAME, ranking prefix matches first, then caps
 * the result so the rendered `<datalist>` never holds 1 200 options.
 */
export function filterPlaces(query: string, limit = 50): Place[] {
  const q = norm(query);
  if (q.length < 2) return PLACES.slice(0, limit);

  const starts: Place[] = [];
  const contains: Place[] = [];
  for (const p of PLACES) {
    const n = norm(p.name);
    if (n.startsWith(q)) starts.push(p);
    else if (n.includes(q)) contains.push(p);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
