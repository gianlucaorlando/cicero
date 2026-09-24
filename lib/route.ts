import { itineraryDistance } from '@/lib/geo';
import type { LatLng, Stop } from '@/lib/types';

/** Minutes spent at each stop when estimating how long the route takes. */
export const MINUTES_PER_STOP = 45;
/** Walking pace used for every estimate in the app: about 4.8 km/h. */
export const WALKING_METERS_PER_MINUTE = 80;

export type MapBanner = 'route' | 'proposal' | 'list' | 'discovery' | 'none';

/**
 * Which banner sits at the bottom of the map.
 *
 * The route wins whenever there is one. In the propose-then-confirm flow a
 * proposal is pending after almost every "yes": letting it take the banner's
 * place removed the only way to open the full route.
 */
export function mapBanner(stopCount: number, visiblePinCount: number, discoveryCount = 0): MapBanner {
  if (stopCount > 0) return 'route';
  if (visiblePinCount === 1) return 'proposal';
  if (visiblePinCount > 1) return 'list';
  if (discoveryCount > 0) return 'discovery';
  return 'none';
}

type MaybePoint = { lat?: number; lng?: number };

function hasCoordinates(point: MaybePoint): point is LatLng {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

/**
 * The points the map frames, as [lng, lat]: the origin, every stop, and the
 * pins on show. Framing only the pins zoomed onto the proposal and pushed the
 * rest of the route off screen, so the user could no longer see where the next
 * stop sits relative to the ones already chosen.
 */
export function framingPoints(origin: LatLng, stops: MaybePoint[], pins: MaybePoint[]): Array<[number, number]> {
  return [origin, ...stops, ...pins].filter(hasCoordinates).map((point) => [point.lng, point.lat]);
}

export function walkingMinutes(distanceMeters: number) {
  return Math.max(1, Math.round(distanceMeters / WALKING_METERS_PER_MINUTE));
}

/** Time at the stops plus walking between them, rounded for display. */
export function estimatedDuration(origin: LatLng, stops: Stop[]) {
  const minutes = stops.length * MINUTES_PER_STOP + Math.round(itineraryDistance(origin, stops) / WALKING_METERS_PER_MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `circa ${rest} min`;
  return rest ? `circa ${hours} h ${rest} min` : `circa ${hours} h`;
}
