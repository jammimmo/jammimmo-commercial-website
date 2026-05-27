import { useEffect, useState } from 'react';
import { parseGps, type LatLng } from '@/lib/gps';

interface Props {
  gps: string | null;
  title: string;
  className?: string;
}

/**
 * Lazy-loaded Leaflet map for the property detail page. Loads react-leaflet
 * + CSS dynamically so the page weight isn't paid until the map is visible.
 */
export default function PropertyMap({ gps, title, className }: Props) {
  const [Mod, setMod] = useState<typeof import('react-leaflet') | null>(null);
  const coords: LatLng | null = parseGps(gps);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('react-leaflet'),
      // @ts-expect-error CSS side-effect import; resolved by Vite
      import('leaflet/dist/leaflet.css'),
    ]).then(([leaflet]) => {
      if (!cancelled) setMod(leaflet);
    });
    return () => { cancelled = true; };
  }, []);

  if (!coords) {
    return (
      <div className={(className ?? '') + ' grid place-items-center bg-muted text-muted-foreground text-sm rounded-2xl border border-clay h-[300px]'}>
        Localisation indisponible
      </div>
    );
  }

  if (!Mod) {
    return (
      <div className={(className ?? '') + ' bg-muted rounded-2xl border border-clay h-[300px] animate-pulse'} />
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = Mod;

  return (
    <div className={className}>
      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: '100%', minHeight: 300, width: '100%', borderRadius: 16, border: '1px solid hsl(var(--clay))' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coords.lat, coords.lng]}>
          <Popup>{title}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
