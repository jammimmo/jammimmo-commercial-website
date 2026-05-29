/**
 * Approximate centroids for Senegalese quartiers / cities.
 *
 * Used as a graceful fallback for the property-detail map when a listing has
 * no exact `gps` value: rather than showing "localisation indisponible", we
 * center the map on the neighbourhood and draw an approximate-area circle.
 * This is also good for privacy — we don't pin the exact building.
 *
 * Coordinates are hand-curated from OpenStreetMap nominatim lookups +
 * averages of the geocoded listings we already have. Precision is
 * neighbourhood-level (~500 m), which is all the fallback needs.
 */

import type { LatLng } from './gps';

/** Normalize a label for lookup: lowercase, strip accents + punctuation. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Dakar quartier centroids (and a few Petite-Côte / regional cities). */
const QUARTIER_CENTROIDS: Record<string, LatLng> = {
  // Dakar — derived from geocoded listings where available, else OSM.
  'grand yoff': { lat: 14.7381, lng: -17.4559 },
  'sacre coeur': { lat: 14.7237, lng: -17.468 },
  yoff: { lat: 14.7547, lng: -17.4889 },
  plateau: { lat: 14.6708, lng: -17.4322 },
  liberte: { lat: 14.7236, lng: -17.4622 },
  almadies: { lat: 14.7445, lng: -17.5161 },
  mermoz: { lat: 14.7036, lng: -17.4727 },
  ouakam: { lat: 14.7244, lng: -17.4969 },
  ngor: { lat: 14.7508, lng: -17.5128 },
  'point e': { lat: 14.6928, lng: -17.4561 },
  fann: { lat: 14.6889, lng: -17.4633 },
  mamelles: { lat: 14.73, lng: -17.505 },
  medina: { lat: 14.6822, lng: -17.4525 },
  'parcelles assainies': { lat: 14.7644, lng: -17.4253 },
  hlm: { lat: 14.715, lng: -17.448 },
  sicap: { lat: 14.71, lng: -17.46 },
  'cite keur gorgui': { lat: 14.7185, lng: -17.4655 },
  vdn: { lat: 14.7263, lng: -17.4646 },
  ngaparou: { lat: 14.4256, lng: -17.0086 },
  somone: { lat: 14.4906, lng: -17.0586 },
};

/** City centroids — coarse fallback when the quartier is unknown. */
const CITY_CENTROIDS: Record<string, LatLng> = {
  dakar: { lat: 14.7167, lng: -17.4677 },
  saly: { lat: 14.45, lng: -17.008 },
  mbour: { lat: 14.4198, lng: -16.9686 },
  'saint louis': { lat: 16.0326, lng: -16.4818 },
  thies: { lat: 14.791, lng: -16.9256 },
  'saly portudal': { lat: 14.45, lng: -17.008 },
};

/**
 * Resolve an approximate location for a listing without exact GPS.
 * Returns the centroid + the precision level so the UI can label it honestly.
 */
export function approximateLocation(
  quartier: string | null | undefined,
  city: string | null | undefined,
): { coords: LatLng; precision: 'quartier' | 'city' } | null {
  if (quartier) {
    const q = QUARTIER_CENTROIDS[norm(quartier)];
    if (q) return { coords: q, precision: 'quartier' };
  }
  if (city) {
    const c = CITY_CENTROIDS[norm(city)];
    if (c) return { coords: c, precision: 'city' };
  }
  return null;
}
