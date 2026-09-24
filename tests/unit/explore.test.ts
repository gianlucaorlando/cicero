import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/places', () => ({
  PlacesError: class extends Error {},
  searchPlaces: vi.fn(),
  findTransitHubs: vi.fn(),
  findSightsNearby: vi.fn(),
  findPopularNearby: vi.fn(),
  SIGHT_TYPES: ['tourist_attraction'],
  FOOD_TYPES: ['restaurant'],
}));

import {
  exploreRadius,
  isCovered,
  mergePlaces,
  metersPerPixel,
  pinBudget,
  PIN_SPACING_PX,
  selectVisiblePins,
  type Viewport,
} from '@/lib/explore';
import { distanceMeters } from '@/lib/geo';
import { clearDiscoveryCache, exploreArea, exploreCell } from '@/lib/server/discover';
import { findPopularNearby } from '@/lib/server/places';
import type { DiscoveryPlace, PlaceCandidate } from '@/lib/types';

const ROME = { lat: 41.8986, lng: 12.4769 };

const place = (id: string, lat: number, lng: number, category: DiscoveryPlace['category'], userRatingCount: number, primaryType?: string): DiscoveryPlace => ({
  id, name: id, address: '', lat, lng, primaryType: primaryType ?? (category === 'food' ? 'restaurant' : 'historical_landmark'),
  businessStatus: 'OPERATIONAL', googleMapsUri: null, rating: 4.5, userRatingCount, distanceMeters: 0, category,
});

/** A viewport of the given zoom centred on Rome, sized like a laptop map. */
function viewportAt(zoom: number, widthPx = 634, heightPx = 718): Viewport {
  const mpp = metersPerPixel(ROME.lat, zoom);
  const halfHeight = (heightPx / 2) * mpp / 111_320;
  const halfWidth = (widthPx / 2) * mpp / (111_320 * Math.cos((ROME.lat * Math.PI) / 180));
  const bounds = { north: ROME.lat + halfHeight, south: ROME.lat - halfHeight, east: ROME.lng + halfWidth, west: ROME.lng - halfWidth };
  return {
    center: ROME,
    radiusMeters: distanceMeters(ROME, { lat: bounds.north, lng: bounds.east }),
    zoom,
    bounds,
    widthPx,
    heightPx,
  };
}

/** A grid of places around Rome: `count` per kind, spread over about 4 km, popularity decreasing. */
function city(count: number): DiscoveryPlace[] {
  const places: DiscoveryPlace[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399;
    const radius = 0.0004 * Math.sqrt(index + 1) * 6;
    const lat = ROME.lat + radius * Math.sin(angle);
    const lng = ROME.lng + radius * Math.cos(angle) * 1.3;
    places.push(place(`sight-${index}`, lat, lng, 'sight', 100_000 - index * 100));
    places.push(place(`food-${index}`, lat + 0.0003, lng - 0.0003, 'food', 50_000 - index * 100));
  }
  return places;
}

describe('pin budget', () => {
  it('grows as the map zooms out and shrinks as it zooms in', () => {
    const budgets = [17, 16, 15, 14, 13, 12].map((zoom) => pinBudget(zoom, 634, 718));
    expect(budgets).toEqual([...budgets].sort((a, b) => a - b));
    expect(budgets[0]).toBeLessThan(budgets.at(-1)!);
  });

  it('gives a phone fewer pins than a laptop at the same zoom, never fewer than three', () => {
    expect(pinBudget(15, 375, 440)).toBeLessThan(pinBudget(15, 634, 718));
    expect(pinBudget(18, 200, 200)).toBe(3);
  });
});

describe('selectVisiblePins', () => {
  const pool = city(120);

  it('shows more pins zoomed out than zoomed in', () => {
    const counts = [17, 16, 15, 14, 13].map((zoom) => selectVisiblePins(pool, viewportAt(zoom), new Set(), null).length);
    for (let index = 1; index < counts.length; index += 1) expect(counts[index]).toBeGreaterThanOrEqual(counts[index - 1]);
    expect(counts.at(-1)!).toBeGreaterThan(counts[0]);
  });

  it('keeps every pin inside the screen and within the budget', () => {
    const viewport = viewportAt(15);
    const pins = selectVisiblePins(pool, viewport, new Set(), null);
    expect(pins.length).toBeLessThanOrEqual(pinBudget(15, viewport.widthPx, viewport.heightPx));
    for (const pin of pins) {
      expect(pin.lat).toBeLessThanOrEqual(viewport.bounds.north);
      expect(pin.lat).toBeGreaterThanOrEqual(viewport.bounds.south);
      expect(pin.lng).toBeLessThanOrEqual(viewport.bounds.east);
      expect(pin.lng).toBeGreaterThanOrEqual(viewport.bounds.west);
    }
  });

  it('never draws two pins on top of each other', () => {
    const viewport = viewportAt(14);
    const pins = selectVisiblePins(pool, viewport, new Set(), null);
    const spacing = PIN_SPACING_PX * metersPerPixel(ROME.lat, 14);
    for (const [index, pin] of pins.entries()) {
      for (const other of pins.slice(index + 1)) expect(distanceMeters(pin, other)).toBeGreaterThanOrEqual(spacing);
    }
  });

  it('prefers the most popular places', () => {
    const famous = place('famous', ROME.lat + 0.0005, ROME.lng, 'sight', 900_000);
    const obscure = place('obscure', ROME.lat + 0.0005, ROME.lng + 0.00005, 'sight', 12);
    const pins = selectVisiblePins([obscure, famous], viewportAt(15), new Set(), null);
    expect(pins.map((pin) => pin.id)).toEqual(['famous']);
  });

  it('keeps both kinds, weighted by area', () => {
    const touristic = selectVisiblePins(pool, viewportAt(14), new Set(), 'touristic');
    const transit = selectVisiblePins(pool, viewportAt(14), new Set(), 'transit');
    const sights = (pins: DiscoveryPlace[]) => pins.filter((pin) => pin.category === 'sight').length;
    const food = (pins: DiscoveryPlace[]) => pins.length - sights(pins);
    expect(sights(touristic)).toBeGreaterThan(food(touristic));
    expect(food(transit)).toBeGreaterThan(sights(transit));
    expect(food(touristic)).toBeGreaterThan(0);
    expect(sights(transit)).toBeGreaterThan(0);
  });

  it('leaves out places that already have their own pin, and closed ones', () => {
    const closed = { ...place('closed', ROME.lat, ROME.lng + 0.001, 'food', 999_999), businessStatus: 'CLOSED_PERMANENTLY' };
    const pins = selectVisiblePins([...pool, closed], viewportAt(14), new Set(['sight-0', 'food-0']), null);
    expect(pins.map((pin) => pin.id)).not.toContain('sight-0');
    expect(pins.map((pin) => pin.id)).not.toContain('food-0');
    expect(pins.map((pin) => pin.id)).not.toContain('closed');
  });
});

describe('covering the screen', () => {
  it('maps any radius to one of a few server radii', () => {
    expect(exploreRadius(100)).toBe(300);
    expect(exploreRadius(900)).toBe(1200);
    expect(exploreRadius(40_000)).toBe(5000);
  });

  it('asks again only for areas not covered yet, or much smaller than what was fetched', () => {
    const fetched = [{ center: ROME, radiusMeters: 1200 }];
    expect(isCovered(fetched, { center: ROME, radiusMeters: 600 })).toBe(true);
    expect(isCovered(fetched, { center: { lat: ROME.lat + 0.002, lng: ROME.lng }, radiusMeters: 600 })).toBe(true);
    expect(isCovered(fetched, { center: { lat: ROME.lat + 0.01, lng: ROME.lng }, radiusMeters: 600 })).toBe(false);
    expect(isCovered(fetched, { center: ROME, radiusMeters: 2500 })).toBe(false);
    // A street-level zoom inside a district-wide lookup gets its own, more local, lookup.
    expect(isCovered(fetched, { center: ROME, radiusMeters: 300 })).toBe(false);
  });

  it('merges places by id, keeps the newest copy and caps the pool', () => {
    const merged = mergePlaces([place('a', 1, 1, 'food', 1), place('b', 1, 1, 'food', 1)], [place('a', 2, 2, 'food', 5)]);
    expect(merged.map((item) => item.id)).toEqual(['b', 'a']);
    expect(merged.find((item) => item.id === 'a')?.userRatingCount).toBe(5);
    expect(mergePlaces(city(30), city(30).slice(0, 2), 10)).toHaveLength(10);
  });
});

describe('exploreArea', () => {
  const candidate = (id: string, primaryType: string, businessStatus = 'OPERATIONAL'): PlaceCandidate => ({
    id, name: id, address: '', lat: ROME.lat, lng: ROME.lng, primaryType, businessStatus,
    googleMapsUri: null, rating: 4.5, userRatingCount: 100, distanceMeters: 0,
  });

  beforeEach(() => {
    clearDiscoveryCache();
    vi.mocked(findPopularNearby).mockReset();
    vi.mocked(findPopularNearby).mockImplementation(async (_center, _radius, types) => (types.includes('restaurant')
      ? [candidate('trattoria', 'italian_restaurant'), candidate('hotel-bar', 'hotel'), candidate('conad', 'supermarket'), candidate('pantheon', 'restaurant')]
      : [candidate('pantheon', 'historical_landmark'), candidate('gone', 'church', 'CLOSED_PERMANENTLY')]));
  });

  it('keeps sights and food by primary type, once each', async () => {
    const places = await exploreArea(ROME, 900);
    expect(places.map((item) => `${item.id}:${item.category}`)).toEqual(['pantheon:sight', 'trattoria:food']);
  });

  it('answers nearby viewports of the same size from the cache', async () => {
    const cell = exploreCell(ROME, 900);
    await exploreArea(ROME, 900);
    // Same cell (a hair from its centre), a radius in the same server bucket.
    await exploreArea({ lat: cell.center.lat + 0.00001, lng: cell.center.lng - 0.00001 }, 1000);
    expect(findPopularNearby).toHaveBeenCalledTimes(2);
    await exploreArea(ROME, 4000);
    expect(findPopularNearby).toHaveBeenCalledTimes(4);
  });

  it('searches from the snapped cell centre with a server radius', () => {
    const cell = exploreCell({ lat: 41.89861, lng: 12.47694 }, 900);
    expect(cell.radius).toBe(1200);
    expect(distanceMeters(cell.center, { lat: 41.89861, lng: 12.47694 })).toBeLessThan(1200 / 8);
  });
});
