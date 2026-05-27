/**
 * GPS string parsing. The DB stores "lat, lng" as text — we split + validate
 * here. Used by the property detail map and the JSON-LD geo block.
 *
 * Ported from admin: src/components/ds/ helpers.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Parse "14.6928, -17.4467" → { lat, lng } | null */
export function parseGps(gps: string | null | undefined): LatLng | null {
  if (!gps || typeof gps !== 'string') return null;
  const parts = gps.split(',').map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]!);
  const lng = parseFloat(parts[1]!);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

/** "14.6928, -17.4467" → human-readable with 4-decimal precision */
export function formatGps({ lat, lng }: LatLng): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** Approximate Dakar centroid — fallback for the homepage map. */
export const SENEGAL_CENTROID: LatLng = { lat: 14.7167, lng: -17.4677 };
