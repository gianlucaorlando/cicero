'use client';

import { useEffect, useRef } from 'react';
import type { Map, Marker } from 'maplibre-gl';

type Coordinates = { lat: number; lng: number };

export function MapPicker({
  coords,
  onChange,
}: {
  coords: Coordinates;
  onChange: (coords: Coordinates) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      const maplibre = await import('maplibre-gl');
      if (disposed || !containerRef.current) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        center: [coords.lng, coords.lat],
        zoom: 15.2,
        attributionControl: { compact: true },
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
      });

      const marker = new maplibre.Marker({
        color: '#a75b3f',
        draggable: true,
        scale: 1.18,
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const next = marker.getLngLat();
        onChangeRef.current({ lat: next.lat, lng: next.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
    }

    void initialize();

    return () => {
      disposed = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
    // The map is created once; coordinate changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([coords.lng, coords.lat]);
    mapRef.current.easeTo({ center: [coords.lng, coords.lat], duration: 550 });
  }, [coords]);

  return <div ref={containerRef} className="map-canvas" aria-label="Mappa interattiva con pin trascinabile" />;
}
