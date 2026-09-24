import { findTransitHubs, searchPlaces, type TransitHub } from '@/lib/server/places';
import type { AreaInfo, AreaKind, Discovery, DiscoveryCategory, DiscoveryPlace, LatLng, PlaceCandidate } from '@/lib/types';

/**
 * Points of interest shown as soon as the app opens: a mix of sights and
 * places to eat around the origin, weighted by the kind of area.
 *
 *  - near a train station or an airport, food weighs more: people just
 *    arrived, often with luggage, and want to eat or sit down first;
 *  - in the centre or a touristic area, sights and attractions weigh more;
 *  - one never excludes the other: every mix keeps both kinds.
 */

/** How close a hub must be to count as "near": stations are compact, airports sprawl. */
export const HUB_RADIUS_METERS: Record<TransitHub['type'], number> = { train_station: 400, airport: 1500 };

/** A touristic area has at least this many much-reviewed sights within the radius. */
export const TOURISTIC = { radiusMeters: 800, minReviews: 3000, minLandmarks: 2 };

export const MIX: Record<AreaKind, Record<DiscoveryCategory, number>> = {
  transit: { food: 5, sight: 3 },
  touristic: { sight: 5, food: 3 },
  'transit-touristic': { food: 4, sight: 4 },
  ordinary: { sight: 4, food: 4 },
};

const QUERIES: Record<DiscoveryCategory, { query: string; openNow: boolean; radiusMeters: number }> = {
  sight: { query: 'monumenti, piazze, chiese e attrazioni storiche', openNow: false, radiusMeters: 1500 },
  food: { query: 'ristoranti, trattorie, pizzerie e bar dove mangiare', openNow: true, radiusMeters: 1000 },
};

const CACHE_TTL_MS = 20 * 60 * 1000;
const cache = new Map<string, { expires: number; discovery: Discovery }>();

/** About 110 m of rounding: moving the pin down the street reuses the same results. */
export function cacheKey(origin: LatLng) {
  return `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
}

export function classifyArea(hubs: TransitHub[], sights: PlaceCandidate[]): AreaInfo {
  const hub = hubs.find((candidate) => candidate.distanceMeters <= HUB_RADIUS_METERS[candidate.type]) ?? null;
  const landmarks = sights.filter((sight) => sight.distanceMeters <= TOURISTIC.radiusMeters
    && (sight.userRatingCount ?? 0) >= TOURISTIC.minReviews).length;
  const touristic = landmarks >= TOURISTIC.minLandmarks;
  const kind: AreaKind = hub && touristic ? 'transit-touristic' : hub ? 'transit' : touristic ? 'touristic' : 'ordinary';
  return { kind, hub: hub?.name ?? null };
}

/** Near and much-reviewed first; permanently closed places never make the map. */
export function pickHighlights(places: PlaceCandidate[], limit: number) {
  return places
    .filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY')
    .sort((left, right) => (right.userRatingCount ?? 0) - (left.userRatingCount ?? 0) || (right.rating ?? 0) - (left.rating ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Interleaves the two lists, favoured category first, without duplicates: a
 * historic café can come back from both searches. When one list runs short
 * the other fills the gap, so the map is never emptier than it could be.
 */
export function mixDiscovery(sights: PlaceCandidate[], food: PlaceCandidate[], kind: AreaKind): DiscoveryPlace[] {
  const weights = MIX[kind];
  const total = weights.sight + weights.food;
  const order: DiscoveryCategory[] = weights.food > weights.sight ? ['food', 'sight'] : ['sight', 'food'];
  const pools: Record<DiscoveryCategory, PlaceCandidate[]> = {
    sight: pickHighlights(sights, sights.length),
    food: pickHighlights(food, food.length),
  };
  const quota: Record<DiscoveryCategory, number> = { sight: weights.sight, food: weights.food };
  const seen = new Set<string>();
  const mixed: DiscoveryPlace[] = [];
  const take = (category: DiscoveryCategory) => {
    while (pools[category].length) {
      const next = pools[category].shift()!;
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      mixed.push({ ...next, category });
      return true;
    }
    return false;
  };

  while (mixed.length < total && (quota.sight > 0 || quota.food > 0)) {
    let progressed = false;
    for (const category of order) {
      if (quota[category] > 0 && take(category)) {
        quota[category] -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  // One kind ran out: fill the remaining slots with the other, so both still show when they can.
  for (const category of order) {
    while (mixed.length < total && take(category)) { /* keep filling */ }
  }
  return mixed;
}

export async function discoverNearby(origin: LatLng, now = Date.now()): Promise<Discovery> {
  const key = cacheKey(origin);
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.discovery;

  const [sights, food, hubs] = await Promise.all([
    searchPlaces({ ...QUERIES.sight, origin, pageSize: 10 }),
    searchPlaces({ ...QUERIES.food, origin, pageSize: 10 }),
    // The area hint is a bonus: if the lookup fails the mix is simply balanced.
    findTransitHubs(origin).catch(() => [] as TransitHub[]),
  ]);
  const area = classifyArea(hubs, sights);
  const discovery: Discovery = { places: mixDiscovery(sights, food, area.kind), area };

  cache.set(key, { expires: now + CACHE_TTL_MS, discovery });
  if (cache.size > 500) cache.clear();
  return discovery;
}

/** Test hook: the cache is module state. */
export function clearDiscoveryCache() {
  cache.clear();
}
