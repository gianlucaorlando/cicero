import { describe, expect, it } from 'vitest';

import { distanceMeters } from '@/lib/geo';
import { isFoodType, isSightType } from '@/lib/place-kinds';
import { MAX_WALK_STOPS, planSightsWalk, shortestOrder, WALK_RADIUS_METERS } from '@/lib/route-planner';
import type { PlaceCandidate } from '@/lib/types';

// Around the Pantheon, Rome: real coordinates, rounded.
const PANTHEON = { id: 'ChIJpantheon00', lat: 41.8986, lng: 12.4769 };

const place = (id: string, lat: number, lng: number, overrides: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
  id, name: id, address: '', lat, lng, primaryType: 'historical_landmark', businessStatus: 'OPERATIONAL',
  googleMapsUri: null, rating: 4.7, userRatingCount: 10_000, distanceMeters: 0, tripadvisor: null, ...overrides,
});

const NAVONA = place('ChIJnavona0000', 41.8992, 12.4731, { userRatingCount: 150_000 });
const MINERVA = place('ChIJminerva000', 41.8980, 12.4779, { primaryType: 'church', userRatingCount: 9_000 });
const TREVI = place('ChIJtrevi00000', 41.9009, 12.4833, { userRatingCount: 400_000 });
const SANT_IVO = place('ChIJsantivo000', 41.8983, 12.4747, { primaryType: 'church', userRatingCount: 3_000 });

describe('place kinds', () => {
  it('recognises sights by the words in their type', () => {
    for (const type of ['historical_landmark', 'church', 'catholic_church', 'museum', 'art_gallery', 'tourist_attraction', 'plaza', 'monument', 'fountain']) {
      expect(isSightType(type), type).toBe(true);
    }
  });

  it('never counts food or unrelated places as sights', () => {
    for (const type of ['restaurant', 'italian_restaurant', 'cafe', 'wine_bar', 'bar', 'ice_cream_shop', 'store', 'point_of_interest', 'barber_shop', '']) {
      expect(isSightType(type), type).toBe(false);
    }
    expect(isSightType(null)).toBe(false);
  });

  it('recognises places to eat and drink', () => {
    for (const type of ['restaurant', 'pizza_restaurant', 'cafe', 'coffee_shop', 'wine_bar', 'bar', 'bar_and_grill', 'bakery', 'ice_cream_shop']) {
      expect(isFoodType(type), type).toBe(true);
    }
    expect(isFoodType('barber_shop')).toBe(false);
    expect(isFoodType('church')).toBe(false);
  });
});

describe('shortestOrder', () => {
  it('finds the order that walks least', () => {
    const start = { lat: 0, lng: 0 };
    const far = { lat: 0, lng: 0.02 };
    const near = { lat: 0, lng: 0.01 };
    const { order, meters } = shortestOrder(start, [far, near]);
    expect(order).toEqual([near, far]);
    expect(meters).toBe(distanceMeters(start, near) + distanceMeters(near, far));
  });

  it('handles no points and one point', () => {
    expect(shortestOrder({ lat: 0, lng: 0 }, [])).toEqual({ order: [], meters: 0 });
    expect(shortestOrder({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0.01 }]).order).toHaveLength(1);
  });
});

describe('planSightsWalk', () => {
  it('builds a walk through the most reviewed sights close by, in the shortest order', () => {
    const walk = planSightsWalk(PANTHEON, [SANT_IVO, TREVI, NAVONA, MINERVA], new Set());
    expect(walk).not.toBeNull();
    expect(walk!.stops).toHaveLength(MAX_WALK_STOPS);
    // Sant'Ivo is the least reviewed of the four: it is the one left out.
    expect(walk!.stops.map((stop) => stop.id).sort()).toEqual([MINERVA.id, NAVONA.id, TREVI.id].sort());
    const ids = walk!.stops.map((stop) => stop.id);
    expect(walk!.distanceMeters).toBe(shortestOrder(PANTHEON, walk!.stops).meters);
    expect(ids).toEqual(shortestOrder(PANTHEON, walk!.stops).order.map((stop) => stop.id));
    // Distances read from the monument just chosen.
    expect(walk!.stops.every((stop) => stop.distanceMeters === distanceMeters(PANTHEON, stop))).toBe(true);
  });

  it('keeps only sights within walking distance', () => {
    const colosseo = place('ChIJcolosseo00', 41.8902, 12.4922, { userRatingCount: 500_000 });
    expect(distanceMeters(PANTHEON, colosseo)).toBeGreaterThan(WALK_RADIUS_METERS);
    const walk = planSightsWalk(PANTHEON, [colosseo, NAVONA, MINERVA], new Set());
    expect(walk!.stops.map((stop) => stop.id)).not.toContain(colosseo.id);
  });

  it('leaves out food, closed places, the anchor itself and stops already in the route', () => {
    const trattoria = place('ChIJtrattoria0', 41.8990, 12.4760, { primaryType: 'restaurant', userRatingCount: 900_000 });
    const closed = place('ChIJclosed0000', 41.8995, 12.4775, { businessStatus: 'CLOSED_PERMANENTLY', userRatingCount: 900_000 });
    const self = { ...place(PANTHEON.id, PANTHEON.lat, PANTHEON.lng), userRatingCount: 1_000_000 };
    const walk = planSightsWalk(PANTHEON, [trattoria, closed, self, NAVONA, MINERVA, TREVI], new Set([TREVI.id]));
    expect(walk!.stops.map((stop) => stop.id).sort()).toEqual([MINERVA.id, NAVONA.id].sort());
  });

  it('treats sights on top of each other as one stop', () => {
    const rotonda = place('ChIJrotonda000', 41.89885, 12.47695, { primaryType: 'plaza', userRatingCount: 800_000 });
    expect(distanceMeters(PANTHEON, rotonda)).toBeLessThan(90);
    const walk = planSightsWalk(PANTHEON, [rotonda, NAVONA, MINERVA], new Set());
    expect(walk!.stops.map((stop) => stop.id)).not.toContain(rotonda.id);
  });

  it('proposes nothing when fewer than two sights qualify', () => {
    expect(planSightsWalk(PANTHEON, [NAVONA], new Set())).toBeNull();
    expect(planSightsWalk(PANTHEON, [NAVONA, MINERVA], new Set([MINERVA.id]))).toBeNull();
    expect(planSightsWalk(PANTHEON, [], new Set())).toBeNull();
  });

  it('ignores duplicates coming from two sources', () => {
    const walk = planSightsWalk(PANTHEON, [NAVONA, NAVONA, MINERVA, MINERVA], new Set());
    expect(walk!.stops).toHaveLength(2);
  });
});
