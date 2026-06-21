import { useEffect } from 'react';

interface Props {
  /**
   * react-leaflet's `useMap`, passed in from the dynamically-loaded module so
   * this component never statically imports react-leaflet/leaflet — that keeps
   * the heavy map deps in the lazy island chunk (only loaded when a map is on
   * screen). Must be rendered as a child of `<MapContainer>` so the context exists.
   */
  useMap: () => { addLayer?: unknown; removeLayer: (l: unknown) => void; hasLayer?: (l: unknown) => boolean } & Record<string, unknown>;
  /** MapLibre GL style URL (e.g. OpenFreeMap Positron). */
  styleUrl: string;
  attribution: string;
  maxZoom?: number;
}

/**
 * OpenFreeMap vector basemap injected into the surrounding Leaflet map via
 * `maplibre-gl-leaflet`. OpenFreeMap is keyless and free for commercial use
 * (no API key, no limits), so there is no env var to provision — this is the
 * production street layer.
 *
 * `maplibre-gl` (+ the leaflet binding) are imported **dynamically**, so the
 * WebGL weight (~230 KB gz) is only paid when a map actually mounts. The UMD
 * plugin `require()`s leaflet + maplibre-gl and patches `L.maplibreGL` onto the
 * same leaflet singleton this app already uses.
 */
export default function VectorBasemap({ useMap, styleUrl, attribution, maxZoom }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: { addTo: (m: unknown) => unknown } | undefined;
    let cancelled = false;

    (async () => {
      const Lmod = await import('leaflet');
      const L = ((Lmod as unknown as { default?: unknown }).default ?? Lmod) as {
        maplibreGL?: (opts: Record<string, unknown>) => { addTo: (m: unknown) => unknown };
      };
      // Side-effect import: patches L.maplibreGL (and pulls in maplibre-gl).
      await import('@maplibre/maplibre-gl-leaflet');
      if (cancelled || typeof L.maplibreGL !== 'function') return;
      layer = L.maplibreGL({ style: styleUrl, attribution, ...(maxZoom ? { maxZoom } : {}) });
      layer.addTo(map);
    })();

    return () => {
      cancelled = true;
      if (layer && map?.hasLayer?.(layer)) map.removeLayer(layer);
    };
  }, [map, styleUrl, attribution, maxZoom]);

  return null;
}
