'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, Map, Marker, Popup } from 'maplibre-gl';

import type { Viewport } from '@/lib/explore';
import { distanceMeters } from '@/lib/geo';
import { placeIcon } from '@/lib/place-icons';
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
  primaryType: string;
  category: 'sight' | 'food';
};

/** A compact card anchored to a pin. `lift` is how far above the point the pin's head sits. */
export type MapPopup = { key: string; lat: number; lng: number; lift: number; content: ReactNode } | null;

type MapLibreModule = typeof import('maplibre-gl');

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

/**
 * The strips of the map covered by the controls: the top bar with search and
 * chips, the banner at the bottom. Framing keeps pins out of them, and so
 * does the choice of which points of interest to draw.
 */
function overlayInsets(height: number) {
  return {
    top: Math.min(180, Math.max(128, Math.round(height * 0.34))),
    // Clears the route banner at the bottom, so the last pin is never half under it.
    bottom: Math.min(130, Math.max(100, Math.round(height * 0.18))),
  };
}

/** Pins this close to the side edges are hard to tap and half cut off. */
const SIDE_INSET_PX = 14;
/** Half a point-of-interest disc plus a hair: a pin centred in the clear area must not spill under a control. */
const PIN_RADIUS_PX = 20;

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
  preview,
  previewStartNumber,
  onOpenPreview,
  onViewportChange,
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
  /** A proposed walk, in order: drawn dashed from the last stop, numbered after the route. */
  preview: MapCandidate[];
  previewStartNumber: number;
  onOpenPreview: (placeId: string) => void;
  /** The area on screen after every pan or zoom: the pins follow it. */
  onViewportChange: (viewport: Viewport) => void;
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
  const previewRef = useRef({ places: preview, startNumber: previewStartNumber });
  const previewMarkersRef = useRef<Marker[]>([]);
  const onOpenPreviewRef = useRef(onOpenPreview);
  const onViewportChangeRef = useRef(onViewportChange);
  /**
   * Pins follow the viewport, so they must not move it: only the first points
   * of interest around a starting point frame the map, and only until the user
   * pans or zooms it themselves.
   */
  const landingFramedRef = useRef(false);
  const userMovedRef = useRef(false);
  const popupRef = useRef<Popup | null>(null);
  // The popup's React content renders into this node through a portal; null during server render.
  const [popupNode] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const onReadyRef = useRef(onReady);
  const coordsRef = useRef(coords);
  const stopsRef = useRef(stops);
  const candidatesRef = useRef(candidates);

  const updateItineraryOverlay = useCallback((fitTarget: 'candidates' | 'route' | 'landing' | false = false) => {
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

    // The proposed walk continues from where the route ends, dashed until the user approves it.
    const validPreview = previewRef.current.places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    const previewSource = map.getSource('route-preview') as GeoJSONSource | undefined;
    void previewSource?.setData(routeFeature(validPreview.length
      ? [routePoints.at(-1)!, ...validPreview.map((place) => [place.lng, place.lat] as [number, number])]
      : []));

    // Points of interest first, so stops and proposals are drawn on top of them.
    discoveryMarkersRef.current.forEach((marker) => marker.remove());
    discoveryMarkersRef.current = discoveryRef.current
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .map((place) => {
        // Chains in their colours and initials, everything else with the glyph of what it is.
        const icon = placeIcon(place);
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `map-discovery-marker ${place.category}${icon.kind === 'brand' ? ' brand' : ''}`;
        element.title = place.name;
        if (icon.kind === 'brand') {
          element.textContent = icon.text;
          element.dataset.length = String(Math.min(3, icon.text.length));
          element.style.setProperty('--brand-bg', icon.background);
          element.style.setProperty('--brand-fg', icon.color);
        } else {
          element.textContent = icon.glyph;
        }
        const kind = icon.kind === 'brand' ? icon.brand : DISCOVERY_LABEL[place.category];
        element.setAttribute('aria-label', `${kind}: ${place.name}. Apri le informazioni`);
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

    previewMarkersRef.current.forEach((marker) => marker.remove());
    previewMarkersRef.current = validPreview.map((place, index) => {
      const number = previewRef.current.startNumber + index;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'map-preview-marker';
      element.textContent = String(number);
      element.title = `${number}. ${place.name} (proposta)`;
      element.setAttribute('aria-label', `Tappa proposta ${number}: ${place.name}. Apri le informazioni`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onOpenPreviewRef.current(place.id);
      });
      return new maplibre.Marker({ element, anchor: 'center' })
        .setLngLat([place.lng, place.lat])
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
    // The whole route stays in frame together with the pins. Points of interest join
    // only the landing frame: they follow the viewport, and framing them would chase them.
    const pins = [...validCandidates, ...validPreview];
    const fitPoints = framingPoints(currentCoords, validStops, fitTarget === 'landing' ? [...pins, ...discoveryRef.current] : pins);
    if (fitPoints.length === 1) {
      map.easeTo({ center: fitPoints[0], zoom: Math.max(map.getZoom(), 15.2), duration: 550 });
      return;
    }

    const bounds = new maplibre.LngLatBounds();
    fitPoints.forEach((point) => bounds.extend(point));
    const insets = overlayInsets(map.getContainer().clientHeight);
    map.fitBounds(bounds, {
      padding: { top: insets.top, right: 54, bottom: insets.bottom, left: 54 },
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
    onOpenPreviewRef.current = onOpenPreview;
    onPopupCloseRef.current = onPopupClose;
    onViewportChangeRef.current = onViewportChange;
  }, [onOpenDiscovery, onOpenPreview, onPopupClose, onViewportChange]);

  useEffect(() => {
    previewRef.current = { places: preview, startNumber: previewStartNumber };
    // A new walk reframes the map so every proposed stop is in view; its withdrawal reframes the route.
    updateItineraryOverlay('route');
  }, [preview, previewStartNumber, updateItineraryOverlay]);

  useEffect(() => {
    discoveryRef.current = discovery;
    const landing = discovery.length > 0 && !landingFramedRef.current && !userMovedRef.current
      && !stopsRef.current.length && !candidatesRef.current.length;
    if (landing) landingFramedRef.current = true;
    updateItineraryOverlay(landing ? 'landing' : false);
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
    if (coordsRef.current.lat !== coords.lat || coordsRef.current.lng !== coords.lng) {
      // A new starting point: its points of interest may frame the map once more.
      landingFramedRef.current = false;
      userMovedRef.current = false;
    }
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
      // MapLibre looks for its worker next to its own file, a path computed at runtime that
      // neither Vite's pre-bundling nor the production build can see: the worker 404s and no
      // GeoJSON layer is ever drawn, starting with the route line. Vite bundles it and gives the URL.
      const [maplibre, { default: workerUrl }] = await Promise.all([
        import('maplibre-gl'),
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      ]);
      maplibre.setWorkerUrl(workerUrl);
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
            'route-preview': {
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
            {
              id: 'route-preview-casing',
              type: 'line',
              source: 'route-preview',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#fffaf2',
                'line-opacity': 0.9,
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 17, 10],
              },
            },
            {
              id: 'route-preview-line',
              type: 'line',
              source: 'route-preview',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#d45126',
                'line-opacity': 0.85,
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 17, 5],
                'line-dasharray': [1.4, 1.6],
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

      const emitViewport = () => {
        const bounds = map.getBounds();
        const center = map.getCenter();
        const { clientWidth: width, clientHeight: height } = map.getContainer();
        // Places are fetched for the whole map, but drawn only where nothing covers them.
        const insets = overlayInsets(height);
        const margin = SIDE_INSET_PX + PIN_RADIUS_PX;
        const northWest = map.unproject([margin, insets.top + PIN_RADIUS_PX]);
        const southEast = map.unproject([width - margin, height - insets.bottom - PIN_RADIUS_PX]);
        onViewportChangeRef.current({
          center: { lat: center.lat, lng: center.lng },
          radiusMeters: distanceMeters({ lat: center.lat, lng: center.lng }, { lat: bounds.getNorth(), lng: bounds.getEast() }),
          zoom: map.getZoom(),
          bounds: { north: northWest.lat, south: southEast.lat, east: southEast.lng, west: northWest.lng },
          widthPx: Math.max(0, width - 2 * margin),
          heightPx: Math.max(0, height - insets.top - insets.bottom - 2 * PIN_RADIUS_PX),
        });
      };
      map.on('moveend', emitViewport);
      // A pan or a pinch by the user (not a fit by the app) makes the view theirs.
      const markUserMove = (event: { originalEvent?: unknown }) => {
        if (event.originalEvent) userMovedRef.current = true;
      };
      map.on('dragstart', markUserMove);
      map.on('zoomstart', markUserMove);
      emitViewport();

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
      previewMarkersRef.current.forEach((marker) => marker.remove());
      previewMarkersRef.current = [];
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
