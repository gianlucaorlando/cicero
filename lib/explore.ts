import { MIX } from '@/lib/discovery-mix';
import { distanceMeters } from '@/lib/geo';
import type { AreaKind, DiscoveryCategory, DiscoveryPlace, LatLng } from '@/lib/types';

/**
 * Pins that follow the map. What is on screen decides what is shown: zooming
 * out reveals more places over a wider area, zooming in keeps fewer, always
 * the most popular first and never on top of each other.
 */

export type Viewport = {
  center: LatLng;
  /** From the centre to a corner: the circle that covers the whole screen. */
  radiusMeters: number;
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number };
  /** Map size in CSS pixels: a phone shows fewer pins than a desktop at the same zoom. */
  widthPx: number;
  heightPx: number;
};

export type Circle = { center: LatLng; radiusMeters: number };

/** Below this zoom the screen spans a city or more: no new places are fetched. */
export const MIN_EXPLORE_ZOOM = 11;
/** Radii the server works with, so nearby viewports share one cached answer. */
export const EXPLORE_RADII = [300, 600, 1200, 2500, 5000] as const;
/** Two pins closer than this on screen overlap: the less popular one waits for a closer zoom. */
export const PIN_SPACING_PX = 40;
/** Screen area (CSS px²) the pin budget is calibrated on: a laptop-sized map. */
const REFERENCE_AREA = 450_000;

export function exploreRadius(radiusMeters: number) {
  return EXPLORE_RADII.find((radius) => radius >= radiusMeters) ?? EXPLORE_RADII.at(-1)!;
}

/**
 * How many pins the screen can take. More when zoomed out (a wider area has
 * more worth seeing), fewer when zoomed in, scaled by the size of the map.
 */
export function pinBudget(zoom: number, widthPx: number, heightPx: number) {
  const base = zoom >= 17 ? 6 : zoom >= 16 ? 8 : zoom >= 15 ? 12 : zoom >= 14 ? 16 : zoom >= 13 ? 22 : 28;
  const scale = Math.min(1.2, Math.max(0.45, (widthPx * heightPx) / REFERENCE_AREA));
  return Math.max(3, Math.round(base * scale));
}

/** Ground distance covered by one CSS pixel (MapLibre renders 512 px tiles). */
export function metersPerPixel(lat: number, zoom: number) {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * Whether places already fetched cover the wanted circle. A circle much
 * smaller than the fetched one is not covered: the popular places of a whole
 * district leave a zoomed-in street almost empty, so it gets its own lookup.
 */
export function isCovered(fetched: Circle[], wanted: Circle) {
  return fetched.some((circle) => wanted.radiusMeters >= circle.radiusMeters / 3
    && distanceMeters(circle.center, wanted.center) + wanted.radiusMeters <= circle.radiusMeters * 1.05);
}

/** Union by id, the newer copy winning; the pool is capped so a long exploration stays light. */
export function mergePlaces(current: DiscoveryPlace[], incoming: DiscoveryPlace[], max = 400): DiscoveryPlace[] {
  const byId = new Map(current.map((place) => [place.id, place]));
  for (const place of incoming) {
    byId.delete(place.id);
    byId.set(place.id, place);
  }
  const merged = [...byId.values()];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

function inside(bounds: Viewport['bounds'], place: LatLng) {
  return place.lat <= bounds.north && place.lat >= bounds.south && place.lng <= bounds.east && place.lng >= bounds.west;
}

const byPopularity = (left: DiscoveryPlace, right: DiscoveryPlace) => (right.userRatingCount ?? 0) - (left.userRatingCount ?? 0)
  || (right.rating ?? 0) - (left.rating ?? 0);

/**
 * The pins to draw for this viewport: inside the screen, not hidden by the
 * route or a proposal, within the budget, spaced so they never overlap, and
 * mixed by area (food first near stations, sights first in the centre, both
 * always when both exist).
 */
export function selectVisiblePins(pool: DiscoveryPlace[], viewport: Viewport, hidden: ReadonlySet<string>, area: AreaKind | null): DiscoveryPlace[] {
  const budget = pinBudget(viewport.zoom, viewport.widthPx, viewport.heightPx);
  const spacing = PIN_SPACING_PX * metersPerPixel(viewport.center.lat, viewport.zoom);
  const candidates = pool.filter((place) => !hidden.has(place.id)
    && place.businessStatus !== 'CLOSED_PERMANENTLY'
    && inside(viewport.bounds, place));

  const weights = MIX[area ?? 'ordinary'];
  const order: DiscoveryCategory[] = weights.food > weights.sight ? ['food', 'sight'] : ['sight', 'food'];
  const queues: Record<DiscoveryCategory, DiscoveryPlace[]> = {
    sight: candidates.filter((place) => place.category === 'sight').sort(byPopularity),
    food: candidates.filter((place) => place.category === 'food').sort(byPopularity),
  };
  const sightQuota = Math.round((budget * weights.sight) / (weights.sight + weights.food));
  const quota: Record<DiscoveryCategory, number> = { sight: sightQuota, food: budget - sightQuota };

  const chosen: DiscoveryPlace[] = [];
  const fits = (place: DiscoveryPlace) => chosen.every((other) => distanceMeters(other, place) >= spacing);
  const take = (category: DiscoveryCategory) => {
    while (queues[category].length) {
      const next = queues[category].shift()!;
      if (fits(next)) {
        chosen.push(next);
        return true;
      }
    }
    return false;
  };

  // Interleave by quota, favoured kind first; when one kind runs out the other fills the budget.
  while (chosen.length < budget) {
    let progressed = false;
    for (const category of order) {
      if (chosen.length < budget && quota[category] > 0 && take(category)) {
        quota[category] -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  for (const category of order) {
    while (chosen.length < budget && take(category)) { /* fill the remaining room */ }
  }
  return chosen;
}
