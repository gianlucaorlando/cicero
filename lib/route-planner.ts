import { distanceMeters } from '@/lib/geo';
import { isSightType } from '@/lib/place-kinds';
import type { LatLng, PlaceCandidate } from '@/lib/types';

/**
 * A short walk through the sights around one the user just chose, offered as
 * a whole. Close enough to walk between them without planning, few enough to
 * accept with a single "sì".
 */
export const WALK_RADIUS_METERS = 700;
export const MAX_WALK_STOPS = 3;
export const MIN_WALK_STOPS = 2;
/** Two sights closer than this are one stop (the Pantheon and the square in front of it). */
export const MIN_SPACING_METERS = 90;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

function walkLength(start: LatLng, points: LatLng[]) {
  let total = 0;
  let previous = start;
  for (const point of points) {
    total += distanceMeters(previous, point);
    previous = point;
  }
  return total;
}

/** The order that walks least from `start` through every point. Exhaustive: a walk has at most a handful of stops. */
export function shortestOrder<T extends LatLng>(start: LatLng, points: T[]): { order: T[]; meters: number } {
  let best = { order: points, meters: walkLength(start, points) };
  for (const order of permutations(points)) {
    const meters = walkLength(start, order);
    if (meters < best.meters) best = { order, meters };
  }
  return best;
}

export type SightsWalk = { stops: PlaceCandidate[]; distanceMeters: number };

/**
 * Chooses the sights worth a walk from `anchor`: sights only, open, within the
 * radius, not already in the route and not on top of each other; the most
 * reviewed first, then put in the shortest walking order. Null when fewer
 * than two qualify: one more sight is a proposal, not a route.
 */
export function planSightsWalk(anchor: LatLng & { id: string }, pool: PlaceCandidate[], excludedIds: ReadonlySet<string>): SightsWalk | null {
  const seen = new Set<string>();
  const nearby = pool.filter((place) => {
    if (seen.has(place.id) || place.id === anchor.id || excludedIds.has(place.id)) return false;
    seen.add(place.id);
    return isSightType(place.primaryType)
      && place.businessStatus !== 'CLOSED_PERMANENTLY'
      && place.businessStatus !== 'CLOSED_TEMPORARILY'
      && distanceMeters(anchor, place) <= WALK_RADIUS_METERS;
  });

  const chosen: PlaceCandidate[] = [];
  const byPopularity = [...nearby].sort((left, right) => (right.userRatingCount ?? 0) - (left.userRatingCount ?? 0)
    || (right.rating ?? 0) - (left.rating ?? 0));
  for (const place of byPopularity) {
    if (chosen.length >= MAX_WALK_STOPS) break;
    const crowded = [anchor, ...chosen].some((other) => distanceMeters(other, place) < MIN_SPACING_METERS);
    if (!crowded) chosen.push(place);
  }
  if (chosen.length < MIN_WALK_STOPS) return null;

  const { order, meters } = shortestOrder(anchor, chosen);
  // Distances read from the sight just chosen: "a 250 m dal Pantheon".
  return { stops: order.map((place) => ({ ...place, distanceMeters: distanceMeters(anchor, place) })), distanceMeters: meters };
}
