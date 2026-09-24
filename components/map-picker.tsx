'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, Map, Marker, Popup } from 'maplibre-gl';

import { framingPoints } from '@/lib/route';

type Coordinates = { lat: number; lng: number };

type MapStop = {
  id: string;
  title: string;
  lat?: number;
  lng?: number;
};

type MapCandidate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type MapDiscovery = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'sight' | 'food';
};

/** A compact card anchored to a pin. `lift` is how far above the point the pin's head sits. */
export type MapPopup = { key: string; lat: number; lng: number; lift: number; content: ReactNode } | null;

type MapLibreModule = typeof import('maplibre-gl');

const DISCOVERY_GLYPH: Record<MapDiscovery['category'], string> = { sight: '🏛️', food: '🍽️' };
const DISCOVERY_LABEL: Record<MapDiscovery['category'], string> = { sight: 'Da vedere', food: 'Per mangiare' };

function popupOffset(lift: number) {
  return {
    top: [0, 10] as [number, number],
    'top-left': [0, 10] as [number, number],
    'top-right': [0, 10] as [number, number],
    bottom: [0, -lift] as [number, number],
    'bottom-left': [0, -lift] as [number, number],
    'bottom-right': [0, -lift] as [number, number],
    left: [18, -lift / 2] as [number, number],
    right: [-18, -lift / 2] as [number, number],
    center: [0, 0] as [number, number],
  };
}

function routeFeature(points: Array<[number, number]>) {
  return {
    type: 'FeatureCollection' as const,
    features: points.length > 1
      ? [{
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: points },
        }]
      : [],
  };
}

export function MapPicker({
  coords,
  onChange,
  stops,
  candidates,
  onSelectCandidate,
  discovery,
  onOpenDiscovery,
  popup,
  onPopupClose,
  focusToken,
  onReady,
}: {
  coords: Coordinates;
  onChange: (coords: Coordinates) => void;
  stops: MapStop[];
  candidates: MapCandidate[];
  onSelectCandidate: (candidateId: string) => void;
  discovery: MapDiscovery[];
  onOpenDiscovery: (placeId: string) => void;
  popup: MapPopup;
  onPopupClose: () => void;
  focusToken: number;
  onReady?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const stopMarkersRef = useRef<Marker[]>([]);
  const candidateMarkersRef = useRef<Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const onSelectCandidateRef = useRef(onSelectCandidate);
  const onOpenDiscoveryRef = useRef(onOpenDiscovery);
  const onPopupCloseRef = useRef(onPopupClose);
  const discoveryRef = useRef(discovery);
  const discoveryMarkersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  // The popup's React content renders into this node through a portal; null during server render.
  const [popupNode] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const onReadyRef = useRef(onReady);
  const coordsRef = useRef(coords);
  const stopsRef = useRef(stops);
  const candidatesRef = useRef(candidates);

  const updateItineraryOverlay = useCallback((fitTarget: 'candidates' | 'route' | false = false) => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;

    const currentCoords = coordsRef.current;
    const validStops = stopsRef.current.filter(
      (stop): stop is MapStop & { lat: number; lng: number } => Number.isFinite(stop.lat) && Number.isFinite(stop.lng),
    );
    const routePoints: Array<[number, number]> = [
      [currentCoords.lng, currentCoords.lat],
      ...validStops.map((stop) => [stop.lng, stop.lat] as [number, number]),
    ];

    const routeSource = map.getSource('itinerary-route') as GeoJSONSource | undefined;
    void routeSource?.setData(routeFeature(routePoints));

    // Points of interest first, so stops and proposals are drawn on top of them.
    discoveryMarkersRef.current.forEach((marker) => marker.remove());
    discoveryMarkersRef.current = discoveryRef.current
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .map((place) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `map-discovery-marker ${place.category}`;
        element.title = place.name;
        element.textContent = DISCOVERY_GLYPH[place.category];
        element.setAttribute('aria-label', `${DISCOVERY_LABEL[place.category]}: ${place.name}. Apri le informazioni`);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onOpenDiscoveryRef.current(place.id);
        });
        return new maplibre.Marker({ element, anchor: 'center' })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
      });

    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current = validStops.map((stop, index) => {
      const element = document.createElement('div');
      element.className = 'map-stop-marker';
      element.textContent = String(index + 1);
      element.title = `${index + 1}. ${stop.title}`;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', `Tappa ${index + 1}: ${stop.title}`);
      return new maplibre.Marker({ element, anchor: 'center' })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    });

    const validCandidates = candidatesRef.current.filter(
      (candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng),
    );
    candidateMarkersRef.current.forEach((marker) => marker.remove());
    candidateMarkersRef.current = validCandidates.map((candidate, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'map-candidate-marker';
      element.title = `${String.fromCharCode(65 + index)}. ${candidate.name}`;
      element.setAttribute('aria-label', `Vedi la scheda di ${candidate.name}`);
      const label = document.createElement('span');
      label.className = 'map-candidate-pin-label';
      label.textContent = String.fromCharCode(65 + index);
      element.appendChild(label);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectCandidateRef.current(candidate.id);
      });
      return new maplibre.Marker({ element, anchor: 'bottom' })
        .setLngLat([candidate.lng, candidate.lat])
        .addTo(map);
    });

    if (!fitTarget) return;
    // The whole route stays in frame together with the pins: framing a single proposal
    // zoomed onto it and pushed the stops already chosen off screen.
    // Points of interest join the frame until a route exists; after that the route leads.
    const fitPoints = framingPoints(currentCoords, validStops, validStops.length ? validCandidates : [...validCandidates, ...discoveryRef.current]);
    if (fitPoints.length === 1) {
      map.easeTo({ center: fitPoints[0], zoom: Math.max(map.getZoom(), 15.2), duration: 550 });
      return;
    }

    const bounds = new maplibre.LngLatBounds();
    fitPoints.forEach((point) => bounds.extend(point));
    const height = map.getContainer().clientHeight;
    map.fitBounds(bounds, {
      padding: {
        top: Math.min(180, Math.max(128, Math.round(height * 0.34))),
        right: 54,
        bottom: Math.min(102, Math.max(78, Math.round(height * 0.18))),
        left: 54,
      },
      maxZoom: 15.5,
      duration: 650,
    });
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectCandidateRef.current = onSelectCandidate;
  }, [onSelectCandidate]);

  useEffect(() => {
    onOpenDiscoveryRef.current = onOpenDiscovery;
    onPopupCloseRef.current = onPopupClose;
  }, [onOpenDiscovery, onPopupClose]);

  useEffect(() => {
    discoveryRef.current = discovery;
    // New points of interest reframe the map only while nothing has been chosen yet.
    updateItineraryOverlay(stopsRef.current.length || candidatesRef.current.length ? false : 'route');
  }, [discovery, updateItineraryOverlay]);

  const popupKey = popup?.key ?? null;
  const popupLat = popup?.lat;
  const popupLng = popup?.lng;
  const popupLift = popup?.lift ?? 0;
  useEffect(() => {
    const previous = popupRef.current;
    popupRef.current = null;
    previous?.remove();
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !popupNode || popupKey === null || popupLat === undefined || popupLng === undefined) return;
    const instance = new maplibre.Popup({
      className: 'place-popup-shell',
      closeButton: true,
      closeOnClick: true,
      maxWidth: '300px',
      offset: popupOffset(popupLift),
    })
      .setLngLat([popupLng, popupLat])
      .setDOMContent(popupNode)
      .addTo(map);
    instance.on('close', () => {
      // Closed by the user (x or a tap on the map), not replaced by another popup.
      if (popupRef.current !== instance) return;
      popupRef.current = null;
      onPopupCloseRef.current();
    });
    popupRef.current = instance;
  }, [popupKey, popupLat, popupLng, popupLift, popupNode]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    coordsRef.current = coords;
    stopsRef.current = stops;
    markerRef.current?.setLngLat([coords.lng, coords.lat]);
    updateItineraryOverlay(candidatesRef.current.length ? 'candidates' : 'route');
  }, [coords, stops, updateItineraryOverlay]);

  useEffect(() => {
    candidatesRef.current = candidates;
    updateItineraryOverlay(candidates.length ? 'candidates' : 'route');
  }, [candidates, updateItineraryOverlay]);

  useEffect(() => {
    if (focusToken > 0) updateItineraryOverlay('route');
  }, [focusToken, updateItineraryOverlay]);

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      const maplibre = await import('maplibre-gl');
      if (disposed || !containerRef.current) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        center: [coordsRef.current.lng, coordsRef.current.lat],
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
            'itinerary-route': {
              type: 'geojson',
              data: routeFeature([]),
            },
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm',
              paint: {
                'raster-saturation': -0.55,
                'raster-contrast': -0.08,
              },
            },
            {
              id: 'itinerary-route-casing',
              type: 'line',
              source: 'itinerary-route',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#fffaf2',
                'line-opacity': 0.96,
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 9, 17, 15],
              },
            },
            {
              id: 'itinerary-route-line',
              type: 'line',
              source: 'itinerary-route',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#d45126',
                'line-opacity': 1,
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 17, 9],
              },
            },
          ],
        },
      });

      mapRef.current = map;
      maplibreRef.current = maplibre;

      const originElement = document.createElement('div');
      originElement.className = 'map-origin-marker';
      originElement.title = 'Punto di partenza: trascina per spostarlo';
      originElement.setAttribute('role', 'img');
      originElement.setAttribute('aria-label', 'Punto di partenza, trascinabile');
      const originPin = document.createElement('span');
      originPin.className = 'map-origin-pin';
      originElement.appendChild(originPin);

      const marker = new maplibre.Marker({
        element: originElement,
        draggable: true,
        anchor: 'bottom',
      })
        .setLngLat([coordsRef.current.lng, coordsRef.current.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const next = marker.getLngLat();
        onChangeRef.current({ lat: next.lat, lng: next.lng });
      });

      markerRef.current = marker;
      updateItineraryOverlay(candidatesRef.current.length ? 'candidates' : 'route');
      map.once('style.load', () => updateItineraryOverlay(candidatesRef.current.length ? 'candidates' : 'route'));
      // The first drawn frame is enough to lift the splash; tiles keep filling in behind it.
      const ready = () => {
        onReadyRef.current?.();
        onReadyRef.current = undefined;
      };
      map.once('render', ready);
      map.once('error', ready);

      let resizeTimer: number | undefined;
      const resizeObserver = new ResizeObserver(() => {
        map.resize();
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          if (candidatesRef.current.length > 0) updateItineraryOverlay('candidates');
          else if (stopsRef.current.length > 0) updateItineraryOverlay('route');
        }, 380);
      });
      resizeObserver.observe(containerRef.current);
      map.once('remove', () => {
        resizeObserver.disconnect();
        if (resizeTimer) window.clearTimeout(resizeTimer);
      });
    }

    void initialize();

    return () => {
      disposed = true;
      stopMarkersRef.current.forEach((marker) => marker.remove());
      stopMarkersRef.current = [];
      candidateMarkersRef.current.forEach((marker) => marker.remove());
      candidateMarkersRef.current = [];
      discoveryMarkersRef.current.forEach((marker) => marker.remove());
      discoveryMarkersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      maplibreRef.current = null;
    };
    // The map is created once; coordinate and itinerary changes are handled above.
  }, [updateItineraryOverlay]);

  return (
    <>
      <div ref={containerRef} className="map-canvas" aria-label="Mappa interattiva con percorso, punti di interesse e pin trascinabile" />
      {popupNode && popup ? createPortal(popup.content, popupNode) : null}
    </>
  );
}
