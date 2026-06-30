import { describe, it, expect } from 'vitest';
import { geoRowToZone, PUBLIC_GEO_VIEW, PUBLIC_GEO_COLUMNS } from './public-geo';

describe('public-geo (fuzzed public geolocation)', () => {
  it('maps a fuzzed view row (snake_case) to a GpsZone (camelCase)', () => {
    const zone = geoRowToZone({
      id: 'abc',
      center_lat: 14.695,
      center_lng: -17.444,
      radius_m: 500,
    });
    expect(zone).toEqual({ centerLat: 14.695, centerLng: -17.444, radiusM: 500 });
  });

  it('defaults radius to 500 m when the view omits radius_m', () => {
    const zone = geoRowToZone({ id: 'abc', center_lat: 14.7, center_lng: -17.4, radius_m: null });
    expect(zone?.radiusM).toBe(500);
  });

  it('returns null when the center is missing (no point to draw)', () => {
    expect(geoRowToZone({ id: 'abc', center_lat: null, center_lng: null, radius_m: 500 })).toBeNull();
  });

  it('returns null on non-finite coordinates', () => {
    expect(
      geoRowToZone({ id: 'abc', center_lat: Number.NaN, center_lng: -17.4, radius_m: 500 }),
    ).toBeNull();
  });

  it('reads from the public fuzzed view and NEVER selects the exact gps column', () => {
    expect(PUBLIC_GEO_VIEW).toBe('properties_public_geo');
    expect(PUBLIC_GEO_COLUMNS).not.toMatch(/\bgps\b/);
    expect(PUBLIC_GEO_COLUMNS).toContain('center_lat');
    expect(PUBLIC_GEO_COLUMNS).toContain('center_lng');
    expect(PUBLIC_GEO_COLUMNS).toContain('radius_m');
  });
});
