/**
 * Public, privacy-safe geolocation (#724972).
 *
 * The exact `properties.gps` column must NEVER reach the public site. The
 * canonical public source is the salted SQL view `public.properties_public_geo`
 * (id, center_lat, center_lng, radius_m=500) whose centre is a server-side
 * DECOY — the real point sits 180–380 m off the returned centre, inside the
 * circle but never at it, and the salt secret is non-readable by `anon`, so the
 * decoy is not invertible. We therefore read the FUZZED centre from the DB and
 * never recompute it client-side (recomputing in the public bundle would leak
 * the algorithm + id and defeat the fuzz).
 *
 * This module owns the view name, the selected columns, and the snake→camel
 * mapping. The selected columns intentionally exclude `gps` so the exact point
 * cannot ride along.
 */

import type { GpsZone } from '@/types/property';

/** Public view exposing only the fuzzed zone — never the exact `gps`. */
export const PUBLIC_GEO_VIEW = 'properties_public_geo';

/** Columns read from {@link PUBLIC_GEO_VIEW}. The exact `gps` is NOT here. */
export const PUBLIC_GEO_COLUMNS = 'id, center_lat, center_lng, radius_m';

/** Default zone radius when the view omits it (the view fixes it at 500 m). */
export const DEFAULT_ZONE_RADIUS_M = 500;

/** Same deterministic ~1km grid as Estate Flow src/lib/property-tour-map.ts
 * approximatePropertyCenter (source3df7904). Never add independent random
 * jitter or accept a more precise legacy-view centre in a new public build. */
const METERS_PER_DEGREE = 111320;
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;
export function approximatePropertyCenter(lat: number, lng: number): { lat: number; lng: number } | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 75 || Math.abs(lng) > 179.9) return;
  const latitude = rounded(Math.round(lat * METERS_PER_DEGREE / 1000) * 1000 / METERS_PER_DEGREE);
  const longitudeStep = 1000 / (METERS_PER_DEGREE * Math.cos(latitude * Math.PI / 180));
  return { lat: latitude, lng: rounded(Math.round(lng / longitudeStep) * longitudeStep) };
}
export const PREPARED_PUBLIC_ZONE_RADIUS_M = 1500;

export interface GeoViewRow {
  id: string;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
}

/**
 * Map a fuzzed-geo view row to a render-safe {@link GpsZone}, or `null` when the
 * centre is missing/invalid (nothing to draw → callers fall back to the
 * quartier/city approximate view).
 */
export function geoRowToZone(row: GeoViewRow): GpsZone | null {
  const { center_lat, center_lng, radius_m } = row;
  if (
    typeof center_lat !== 'number' ||
    !Number.isFinite(center_lat) ||
    typeof center_lng !== 'number' ||
    !Number.isFinite(center_lng)
  ) {
    return null;
  }
  return {
    centerLat: center_lat,
    centerLng: center_lng,
    radiusM:
      typeof radius_m === 'number' && Number.isFinite(radius_m) && radius_m > 0
        ? radius_m
        : DEFAULT_ZONE_RADIUS_M,
  };
}
