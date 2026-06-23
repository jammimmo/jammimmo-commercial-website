import { useEffect, useState } from 'react';
import { parseGps, type LatLng } from '@/lib/gps';
import { approximateLocation } from '@/lib/dakar-geo';
import { STREETS_VECTOR, MAP_BASE_OPTIONS } from '@/lib/map-tiles';
import VectorBasemap from './VectorBasemap';

interface Props {
  gps: string | null;
  title: string;
  /** Used to derive an approximate-area map when `gps` is missing. */
  quartier?: string | null;
  city?: string | null;
  className?: string;
}

/**
 * Lazy-loaded Leaflet map for the property detail page.
 *
 * Three states, in priority order:
 *   1. Exact GPS  → precise brand pin at the coordinates.
 *   2. No GPS but a known quartier/city → approximate-area view: a translucent
 *      circle centred on the neighbourhood centroid (honest about precision,
 *      and good for privacy — we don't pin the exact building).
 *   3. Nothing resolvable → graceful "indisponible" placeholder.
 *
 * Note: we deliberately use a `divIcon` (inline SVG) rather than Leaflet's
 * default marker. The default marker references PNGs whose URLs break under
 * Vite's bundler (the classic "marker icon 404" bug), which is why the pin
 * was invisible before.
 */
export default function PropertyMap({ gps, title, quartier, city, className }: Props) {
  type LeafletMod = typeof import('react-leaflet');
  type Leaflet = typeof import('leaflet');
  const [RL, setRL] = useState<LeafletMod | null>(null);
  const [L, setL] = useState<Leaflet | null>(null);

  const exact: LatLng | null = parseGps(gps);
  const approx = exact ? null : approximateLocation(quartier, city);
  const coords = exact ?? approx?.coords ?? null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([rl, l]) => {
      if (!cancelled) {
        setRL(rl);
        setL(l.default ?? l);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!coords) {
    return (
      <div
        className={
          (className ?? '') +
          ' grid place-items-center bg-muted text-muted-foreground text-sm rounded-2xl border border-clay h-[300px]'
        }
      >
        Localisation indisponible
      </div>
    );
  }

  if (!RL || !L) {
    return (
      <div
        className={(className ?? '') + ' bg-muted rounded-2xl border border-clay h-[300px] animate-pulse'}
      />
    );
  }

  const { MapContainer, Marker, Popup, Circle, AttributionControl, useMap } = RL;

  // Brand teardrop pin as an inline-SVG divIcon — no external image, so it
  // can't 404 under the bundler. Anchored at the tip (bottom-center).
  const pin = L.divIcon({
    className: 'jamm-property-pin',
    html: `
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M17 43C17 43 32 27.5 32 16C32 7.7 25.3 1 17 1C8.7 1 2 7.7 2 16C2 27.5 17 43 17 43Z"
              fill="hsl(234 60% 36%)" stroke="white" stroke-width="2"/>
        <circle cx="17" cy="16" r="5.5" fill="white"/>
      </svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
    popupAnchor: [0, -38],
  });

  const isApprox = !exact && !!approx;
  // Approximate view zooms out a touch; exact view zooms in on the building.
  const zoom = exact ? 15 : approx?.precision === 'city' ? 12 : 14;

  return (
    <div className={className}>
      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={zoom}
        maxZoom={STREETS_VECTOR.maxZoom}
        scrollWheelZoom={false}
        style={{
          height: '100%',
          minHeight: 300,
          width: '100%',
          borderRadius: 16,
          border: '1px solid hsl(var(--clay))',
        }}
        {...MAP_BASE_OPTIONS}
      >
        <AttributionControl position="bottomright" prefix={false} />
        <VectorBasemap
          useMap={useMap}
          styleUrl={STREETS_VECTOR.styleUrl}
          attribution={STREETS_VECTOR.attribution}
          maxZoom={STREETS_VECTOR.maxZoom}
        />
        {isApprox ? (
          <Circle
            center={[coords.lat, coords.lng]}
            radius={approx?.precision === 'city' ? 1400 : 600}
            pathOptions={{
              color: 'hsl(234 60% 36%)',
              fillColor: 'hsl(234 60% 36%)',
              fillOpacity: 0.12,
              weight: 1.5,
            }}
          />
        ) : (
          <Marker position={[coords.lat, coords.lng]} icon={pin}>
            <Popup>{title}</Popup>
          </Marker>
        )}
      </MapContainer>
      {isApprox && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/80 px-1">
          Zone approximative — l'emplacement exact est communiqué sur demande.
        </p>
      )}
    </div>
  );
}
