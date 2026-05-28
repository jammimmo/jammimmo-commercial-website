/**
 * Tile-layer configuration for Leaflet maps.
 *
 * We support two layers visible to users:
 *   • streets — clean editorial street style (Jawg.Streets, fallback to
 *     OpenStreetMap Mapnik if the Jawg key isn't configured)
 *   • satellite — Esri WorldImagery aerial photography
 *
 * The Jawg key is read from `PUBLIC_JAWG_ACCESS_TOKEN`. It MUST be a public
 * env var because tiles load client-side. To stop abuse, restrict the token
 * to your production domain in the Jawg dashboard:
 *   https://www.jawg.io/lab/  → Access Token → "Allowed origins"
 *
 * If you ever want to swap styles, the URL templates below come from
 *   https://leaflet-extras.github.io/leaflet-providers/preview/
 */

export interface TileSpec {
  url: string;
  attribution: string;
  /** Maximum zoom the provider supports — Leaflet caps the user there. */
  maxZoom: number;
}

const JAWG_TOKEN: string = import.meta.env.PUBLIC_JAWG_ACCESS_TOKEN ?? '';

/**
 * Editorial street layer. Jawg.Streets when the token is set, otherwise the
 * vanilla OSM raster as a graceful fallback (so previews / local dev still
 * render a map without forcing every contributor to configure a token).
 */
export const STREETS: TileSpec = JAWG_TOKEN
  ? {
      url: `https://tile.jawg.io/jawg-streets/{z}/{x}/{y}{r}.png?access-token=${JAWG_TOKEN}`,
      attribution:
        '&copy; <a href="https://jawg.io" target="_blank" rel="noopener">Jawg</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 22,
    }
  : {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 19,
    };

/**
 * Satellite layer — Esri WorldImagery. No key required, free for moderate
 * traffic. If we ever outgrow Esri's TOS the swap is one URL.
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
 * can drop the "Leaflet" branding from the bottom-right (the library author's
 * preferred-but-not-required link). Provider/OSM attribution stays — that's
 * a license requirement, not a stylistic choice.
 */
export const MAP_BASE_OPTIONS = {
  attributionControl: false as const,
};
