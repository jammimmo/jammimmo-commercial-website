/**
 * Tile-layer configuration for Leaflet maps.
 *
 * We support two layers visible to users:
 *   • streets  — clean editorial street style. Default: CartoDB Voyager
 *                (no key required, modern Zillow-like look). Upgrades to
 *                Jawg.Streets if `PUBLIC_JAWG_ACCESS_TOKEN` is set.
 *   • satellite — Esri WorldImagery aerial photography.
 *
 * All three providers are token-free out of the box. The Jawg upgrade is
 * optional — set the env var only if you want to swap aesthetics or move
 * Voyager off CartoDB's free fair-use bucket once traffic grows.
 *
 * To swap styles, browse https://leaflet-extras.github.io/leaflet-providers/preview/
 * and replace `url` + `attribution` + `maxZoom` below. The CSP `img-src`
 * in public/_headers must also list the new tile origin.
 */

export interface TileSpec {
  url: string;
  attribution: string;
  /** Maximum zoom the provider supports — Leaflet caps the user there. */
  maxZoom: number;
  /** Subdomain list for Leaflet's `{s}` token. */
  subdomains?: string;
}

const JAWG_TOKEN: string = import.meta.env.PUBLIC_JAWG_ACCESS_TOKEN ?? '';
const GEOAPIFY_KEY: string = import.meta.env.PUBLIC_GEOAPIFY_API_KEY ?? '';

/**
 * Geoapify Positron — clean editorial palette with denser street-name labelling
 * than CARTO Voyager, and (decisively) a FREE tier that PERMITS commercial /
 * production use — unlike Voyager/Jawg/MapTiler/Stadia, whose free tiers are
 * non-commercial only. Leaflet raster, retina `{r}` @2x, zoom 20. Needs a free
 * key (no card): create at geoapify.com → set PUBLIC_GEOAPIFY_API_KEY in the
 * Cloudflare Pages env. CSP `img-src` lists maps.geoapify.com.
 */
const GEOAPIFY_POSITRON: TileSpec = {
  url: `https://maps.geoapify.com/v1/tile/positron/{z}/{x}/{y}{r}.png?apiKey=${GEOAPIFY_KEY}`,
  attribution:
    '&copy; <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 20,
};

/**
 * OpenStreetMap-France Humanitarian (HOT) — KEYLESS, unambiguously free for
 * commercial use (CC0 style + ODbL data). Used as the zero-friction fallback
 * when no Geoapify key is set (local dev / before the env var is added). Labels
 * are sparser than Geoapify/Voyager, so it's a fallback, not the target style.
 */
const OSM_FRANCE_HOT: TileSpec = {
  url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.hotosm.org/" target="_blank" rel="noopener">Humanitarian OSM Team</a>',
  maxZoom: 19,
  subdomains: 'abc',
};

/**
 * Jawg.Streets — used when a token is configured. Same family (modern street
 * style) but on infrastructure that's explicitly intended for commercial use,
 * with domain-restricted access tokens.
 */
const JAWG_STREETS: TileSpec = {
  url: `https://tile.jawg.io/jawg-streets/{z}/{x}/{y}{r}.png?access-token=${JAWG_TOKEN}`,
  attribution:
    '&copy; <a href="https://jawg.io" target="_blank" rel="noopener">Jawg</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  maxZoom: 22,
};

/**
 * Editorial street layer, in priority order:
 *   1. Geoapify Positron   — if PUBLIC_GEOAPIFY_API_KEY is set (target style:
 *                            best free + commercial-licensed + well-labelled).
 *   2. Jawg.Streets        — if a Jawg token is set instead.
 *   3. OSM-France HOT      — keyless, commercial-safe fallback (no key needed).
 *
 * NOTE: CARTO Voyager was dropped — its free tier is non-commercial only, a
 * licensing risk for a business site. See the map-tile research (2026-06).
 * `{r}` resolves to "@2x" on retina screens (sharper on Mac/iPhone).
 */
export const STREETS: TileSpec = GEOAPIFY_KEY
  ? GEOAPIFY_POSITRON
  : JAWG_TOKEN
    ? JAWG_STREETS
    : OSM_FRANCE_HOT;

/**
 * Satellite layer — Esri WorldImagery. No key required, free for the
 * traffic ranges we expect. If we ever outgrow Esri's TOS the swap is one URL.
 */
export const SATELLITE: TileSpec = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 19,
};

/**
 * Map options we pass to every `MapContainer`. `attributionControl: false`
 * lets us mount our own `<AttributionControl prefix={false} />` child so we
 * can drop the "Leaflet" branding from the bottom-right. Provider/OSM
 * attribution stays — that's an ODbL license requirement, not stylistic.
 */
export const MAP_BASE_OPTIONS = {
  attributionControl: false as const,
};
