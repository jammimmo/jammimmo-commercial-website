import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicProperty } from '@/types/property';
import { parseGps } from '@/lib/gps';

interface Props {
  properties: PublicProperty[];
  /** Highlight this reference (e.g. card-hover) */
  activeRef: string | null;
  /** Click a pin → bubble up so the list can scroll to that card */
  onPinClick?: (ref: string) => void;
}

const FCFA = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

function compactPrice(p: PublicProperty): string {
  const v = FCFA.format(p.price).toUpperCase();
  return p.transaction_type === 'Location' ? `${v} FCFA/mois` : `${v} FCFA`;
}

/**
 * Multi-marker Leaflet map for /biens. Each property gets a custom HTML pin
 * (a price-tag pill, à la Zillow / Booking.com). Hovered card → matching pin
 * is highlighted (secondary colour + scale). Clicking a pin notifies the
 * parent so the list can scroll to that card.
 *
 * react-leaflet + CSS are loaded dynamically — the map weight is not paid
 * until this component mounts.
 */
export default function ListingsMap({ properties, activeRef, onPinClick }: Props) {
  type LeafletMod = typeof import('react-leaflet');
  type Leaflet = typeof import('leaflet');
  const [RL, setRL] = useState<LeafletMod | null>(null);
  const [L, setL] = useState<Leaflet | null>(null);
  const [tileStyle, setTileStyle] = useState<'streets' | 'satellite'>('streets');

  const placed = useMemo(
    () =>
      properties
        .map((p) => ({ p, coords: parseGps(p.gps) }))
        .filter((x): x is { p: PublicProperty; coords: { lat: number; lng: number } } => !!x.coords),
    [properties],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
      // @ts-expect-error CSS side-effect import
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

  // Fallback: nothing geo-located
  if (placed.length === 0) {
    return (
      <div className="grid place-items-center bg-muted text-muted-foreground rounded-2xl border border-clay h-full min-h-[300px]">
        Aucun bien géolocalisé
      </div>
    );
  }

  if (!RL || !L) {
    return <div className="bg-muted rounded-2xl border border-clay h-full min-h-[300px] animate-pulse" />;
  }

  // Fit all markers in view
  const lats = placed.map((x) => x.coords.lat);
  const lngs = placed.map((x) => x.coords.lng);
  const center: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];

  const { MapContainer, TileLayer, Marker, useMap } = RL;

  function makeIcon(p: PublicProperty, isActive: boolean) {
    return L!.divIcon({
      className: 'jamm-price-marker', // wrapper class — overridden below in CSS
      iconAnchor: [40, 32],
      html: `
        <div class="price-pin ${isActive ? 'is-active' : ''}" data-ref="${p.reference}">
          <span class="price-pin-label">${compactPrice(p)}</span>
          <span class="price-pin-tail"></span>
        </div>
      `,
    });
  }

  // Helper component: keeps map view in sync when filtered list changes.
  function FitBounds({ coords }: { coords: Array<[number, number]> }) {
    const map = useMap();
    useEffect(() => {
      if (coords.length === 0) return;
      if (coords.length === 1) {
        map.setView(coords[0]!, 14, { animate: true });
        return;
      }
      const b = L!.latLngBounds(coords as [number, number][]);
      map.fitBounds(b, { padding: [40, 40], maxZoom: 14, animate: true });
    }, [JSON.stringify(coords)]);
    return null;
  }

  return (
    <>
      <style>{`
        .jamm-price-marker { background: transparent !important; border: 0 !important; }
        .price-pin {
          position: relative;
          display: inline-flex; align-items: center;
          padding: 6px 12px;
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-weight: 600;
          font-size: 12.5px;
          border-radius: 999px;
          white-space: nowrap;
          box-shadow: 0 6px 16px -4px hsl(var(--ink) / 0.45);
          transition: transform .2s ease, background-color .2s ease;
          cursor: pointer;
          transform-origin: bottom center;
        }
        .price-pin-tail {
          position: absolute;
          bottom: -6px; left: 50%;
          width: 0; height: 0;
          transform: translateX(-50%);
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid hsl(var(--primary));
          transition: border-top-color .2s ease;
        }
        .price-pin.is-active {
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          transform: scale(1.1);
          z-index: 1000 !important;
        }
        .price-pin.is-active .price-pin-tail { border-top-color: hsl(var(--secondary)); }
        .price-pin:hover { transform: scale(1.05); }
      `}</style>
      <div className="relative h-full">
        {/* Map style toggle — top-right pill */}
        <div className="absolute top-3 right-3 z-[401] inline-flex p-1 rounded-full bg-card/95 backdrop-blur border border-clay shadow-md text-[12px] font-semibold">
          <button
            type="button"
            onClick={() => setTileStyle('streets')}
            className={
              'px-3 py-1 rounded-full transition ' +
              (tileStyle === 'streets'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Plan
          </button>
          <button
            type="button"
            onClick={() => setTileStyle('satellite')}
            className={
              'px-3 py-1 rounded-full transition ' +
              (tileStyle === 'satellite'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Satellite
          </button>
        </div>

        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom
          style={{ height: '100%', width: '100%', minHeight: 360 }}
        >
          {tileStyle === 'streets' ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          ) : (
            <TileLayer
              attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          )}
          <FitBounds coords={placed.map((x) => [x.coords.lat, x.coords.lng])} />
          {placed.map(({ p, coords }) => (
            <Marker
              key={p.reference}
              position={[coords.lat, coords.lng]}
              icon={makeIcon(p, p.reference === activeRef)}
              eventHandlers={{ click: () => onPinClick?.(p.reference) }}
            />
          ))}
        </MapContainer>
      </div>
    </>
  );
}
