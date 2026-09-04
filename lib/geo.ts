import type { LatLng, Stop } from '@/lib/types';

const EARTH_RADIUS_METERS = 6371000;

export function distanceMeters(from: LatLng, to: LatLng) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function humanDistance(value: number) {
  return value < 1000
    ? `${Math.max(10, Math.round(value / 10) * 10)} m`
    : `${(value / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Total walking distance from the origin through every stop, in order. */
export function itineraryDistance(origin: LatLng, stops: Stop[]) {
  let previous: LatLng = origin;
  let total = 0;
  for (const stop of stops) {
    total += distanceMeters(previous, stop);
    previous = stop;
  }
  return total;
}

export function googleMapsRouteUrl(origin: LatLng, stops: Stop[]) {
  if (!stops.length) return null;
  const locations = stops.map((stop) => `${stop.lat},${stop.lng}`);
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: locations.at(-1)!,
    travelmode: 'walking',
  });
  const lastStop = stops.at(-1);
  if (lastStop?.placeId) params.set('destination_place_id', lastStop.placeId);
  if (locations.length > 1) params.set('waypoints', locations.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Stable fingerprint used to tell whether the current itinerary matches the saved one. */
export function itinerarySignature(city: string, locationLabel: string, origin: LatLng, stops: Stop[]) {
  return JSON.stringify({
    city,
    locationLabel,
    origin: { lat: Number(origin.lat.toFixed(6)), lng: Number(origin.lng.toFixed(6)) },
    stops: stops.map((stop) => ({
      id: stop.id,
      time: stop.time,
      title: stop.title,
      detail: stop.detail,
      placeId: stop.placeId,
      address: stop.address,
      lat: stop.lat,
      lng: stop.lng,
    })),
  });
}

export function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as Record<string, unknown>;
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
