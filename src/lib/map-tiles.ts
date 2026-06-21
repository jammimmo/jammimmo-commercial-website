/**
 * Map base-layer configuration for the Leaflet maps.
 *
 * Two layers are visible to users:
 *   • streets   — OpenFreeMap **Positron** vector tiles (MapLibre GL), mounted
 *                 inside Leaflet via `maplibre-gl-leaflet` (see VectorBasemap).
 *   • satellite — Esri WorldImagery aerial photography (raster).
 *
 * Why OpenFreeMap: it is **keyless** (no API key, no registration, no cookies),
 * has **no request limits**, and is **explicitly free for commercial / production
 * use** — unlike CARTO Voyager, Jawg, MapTiler, Stadia (non-commercial free tiers)
 * and unlike the OSM-France / OSM.org raster servers (whose usage policies target
 * non-commercial / low-volume use and warn access may be withdrawn for commercial
 * services). It serves the same editorial "Positron" palette we wanted from
 * Geoapify, but with no key to provision. Data © OpenStreetMap, tiles ©
 * OpenMapTiles, hosting by OpenFreeMap. See https://openfreemap.org.
 *
 * Note on labels: Dakar street-name density is limited by upstream OSM data, not
 * by the tile style — so the keyless vector base is on par with paid styles there.
 */

export interface TileSpec {
  url: string;
  attribution: string;
  /** Maximum zoom the provider supports — Leaflet caps the user there. */
  maxZoom: number;
  /** Subdomain list for Leaflet's `{s}` token. */
  subdomains?: string;
}

export interface VectorStyleSpec {
  /** MapLibre GL style URL (vector). */
  styleUrl: string;
  attribution: string;
  maxZoom: number;
}

/**
 * OpenFreeMap Positron — keyless vector street style (MapLibre GL). No env var,
 * no key: this is the production default. Rendered via `maplibre-gl-leaflet`
 * inside the existing Leaflet map (markers/circles stay native Leaflet).
 */
export const STREETS_VECTOR: VectorStyleSpec = {
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',
  attribution:
    '&copy; <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 20,
};

/**
 * Satellite layer — Esri WorldImagery (raster, keyless). Free for the traffic
 * ranges we expect; if we ever outgrow Esri's TOS the swap is one URL.
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
