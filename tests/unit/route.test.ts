import { describe, expect, it } from 'vitest';

import { distanceMeters } from '@/lib/geo';
import { estimatedDuration, framingPoints, mapBanner, walkingMinutes } from '@/lib/route';
import type { Stop } from '@/lib/types';

const piazzaVenezia = { lat: 41.8959, lng: 12.4823 };
const pantheon = { lat: 41.8986, lng: 12.4769 };
const colosseo = { lat: 41.8902, lng: 12.4922 };
const trevi = { lat: 41.9009, lng: 12.4833 };

const stop = (id: string, point: { lat: number; lng: number }): Stop => ({
  id, placeId: id, time: '10:00', title: id, detail: '', kind: 'place', ...point,
});

describe('mapBanner: the full route stays reachable', () => {
  it('shows the route whenever there are stops, even with a proposal pending', () => {
    // The regression: after every "yes" a new proposal is pending, and it used to hide the route.
    expect(mapBanner(3, 1)).toBe('route');
    expect(mapBanner(1, 1)).toBe('route');
  });

  it('shows the route even while the full list of options is on the map', () => {
    expect(mapBanner(2, 6)).toBe('route');
  });

  it('shows the proposal or the list only before the first stop', () => {
    expect(mapBanner(0, 1)).toBe('proposal');
    expect(mapBanner(0, 6)).toBe('list');
  });

  it('shows nothing on an empty map', () => {
    expect(mapBanner(0, 0)).toBe('none');
  });
});

describe('framingPoints: the map frames the whole route', () => {
  it('includes the origin, every stop and the pending proposal', () => {
    const points = framingPoints(piazzaVenezia, [stop('pantheon', pantheon), stop('colosseo', colosseo)], [trevi]);
    expect(points).toEqual([
      [piazzaVenezia.lng, piazzaVenezia.lat],
      [pantheon.lng, pantheon.lat],
      [colosseo.lng, colosseo.lat],
      [trevi.lng, trevi.lat],
    ]);
  });

  it('never frames the proposal alone once a route exists', () => {
    // Zooming onto the single proposed pin is what pushed the route off screen.
    const points = framingPoints(piazzaVenezia, [stop('colosseo', colosseo)], [trevi]);
    expect(points.length).toBeGreaterThan(1);
    expect(points).toContainEqual([colosseo.lng, colosseo.lat]);
    expect(points).toContainEqual([piazzaVenezia.lng, piazzaVenezia.lat]);
  });

  it('frames the origin next to the options before the first stop', () => {
    expect(framingPoints(piazzaVenezia, [], [trevi])).toEqual([
      [piazzaVenezia.lng, piazzaVenezia.lat],
      [trevi.lng, trevi.lat],
    ]);
  });

  it('skips points without coordinates instead of breaking the bounds', () => {
    const points = framingPoints(piazzaVenezia, [{ lat: undefined, lng: 12.5 }, stop('pantheon', pantheon)], [{ lat: Number.NaN, lng: 1 }]);
    expect(points).toEqual([
      [piazzaVenezia.lng, piazzaVenezia.lat],
      [pantheon.lng, pantheon.lat],
    ]);
  });

  it('is just the origin on an empty map', () => {
    expect(framingPoints(piazzaVenezia, [], [])).toEqual([[piazzaVenezia.lng, piazzaVenezia.lat]]);
  });
});

describe('route estimates', () => {
  it('converts distance to walking minutes, never below one', () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(800)).toBe(10);
  });

  it('adds time at the stops to the walking time', () => {
    const route = [stop('pantheon', pantheon), stop('colosseo', colosseo)];
    const walking = Math.round((distanceMeters(piazzaVenezia, pantheon) + distanceMeters(pantheon, colosseo)) / 80);
    const total = 2 * 45 + walking;
    const expected = total % 60
      ? `circa ${Math.floor(total / 60)} h ${total % 60} min`
      : `circa ${Math.floor(total / 60)} h`;
    expect(estimatedDuration(piazzaVenezia, route)).toBe(expected);
  });

  it('stays in minutes for a short route', () => {
    expect(estimatedDuration(piazzaVenezia, [stop('trevi', trevi)])).toMatch(/^circa \d+ min$/);
  });
});
