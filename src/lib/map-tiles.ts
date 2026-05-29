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

/**
 * CartoDB Voyager — color-coded streets, modern editorial palette, the look
 * you see on Compass / Redfin. Free, no API key, no signup. Carto's TOS
 * permits fair-use without registration; for high-volume commercial use they
 * recommend a paid plan (https://carto.com/legal/), but for an early-stage
 * agency site this is the sweet spot of looks-vs-friction.
 *
 * `{r}` resolves to "@2x" on retina screens — sharper tiles on Mac/iPhone
 * without doubling bandwidth on low-DPI devices.
 */
const CARTODB_VOYAGER: TileSpec = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  maxZoom: 20,
  subdomains: 'abcd',
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
 * Editorial street layer — Jawg if the token is set, otherwise Voyager.
 * Both look modern, both are correct for an editorial real-estate site;
 * the only difference is the operational story behind them.
 */
export const STREETS: TileSpec = JAWG_TOKEN ? JAWG_STREETS : CARTODB_VOYAGER;

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
