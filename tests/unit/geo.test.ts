import { describe, expect, it } from 'vitest';

import { distanceMeters, googleMapsRouteUrl, humanDistance, isValidLatLng, itineraryDistance, itinerarySignature } from '@/lib/geo';
import type { Stop } from '@/lib/types';

const duomo = { lat: 45.4642, lng: 9.19 };
const castello = { lat: 45.4706, lng: 9.1794 };

const stop = (id: string, lat: number, lng: number, extra: Partial<Stop> = {}): Stop => ({
  id, time: '10:00', title: id, detail: '', kind: 'place', lat, lng, ...extra,
});

describe('distanceMeters', () => {
  it('measures Duomo to Castello Sforzesco at roughly 1.1 km', () => {
    const d = distanceMeters(duomo, castello);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1300);
  });

  it('is zero for the same point', () => {
    expect(distanceMeters(duomo, duomo)).toBe(0);
  });
});

describe('humanDistance', () => {
  it('rounds short distances to 10 m with a 10 m floor', () => {
    expect(humanDistance(3)).toBe('10 m');
    expect(humanDistance(146)).toBe('150 m');
  });

  it('uses kilometres with an Italian decimal comma', () => {
    expect(humanDistance(1500)).toBe('1,5 km');
  });
});

describe('itineraryDistance', () => {
  it('sums the legs from the origin through every stop', () => {
    const stops = [stop('a', castello.lat, castello.lng), stop('b', duomo.lat, duomo.lng)];
    expect(itineraryDistance(duomo, stops)).toBe(2 * distanceMeters(duomo, castello));
    expect(itineraryDistance(duomo, [])).toBe(0);
  });
});

describe('googleMapsRouteUrl', () => {
  it('returns null without stops', () => {
    expect(googleMapsRouteUrl(duomo, [])).toBeNull();
  });

  it('builds a walking route with waypoints and the last place id', () => {
    const url = googleMapsRouteUrl(duomo, [stop('a', 45.47, 9.18), stop('b', 45.48, 9.17, { placeId: 'ChIJabc' })]);
    const params = new URL(url!).searchParams;
    expect(params.get('travelmode')).toBe('walking');
    expect(params.get('origin')).toBe('45.4642,9.19');
    expect(params.get('destination')).toBe('45.48,9.17');
    expect(params.get('waypoints')).toBe('45.47,9.18');
    expect(params.get('destination_place_id')).toBe('ChIJabc');
  });
});

describe('itinerarySignature', () => {
  it('ignores sub-micro-degree origin noise but tracks stop changes', () => {
    const a = itinerarySignature('Milano', 'Centro', duomo, [stop('a', 45.47, 9.18)]);
    const b = itinerarySignature('Milano', 'Centro', { lat: duomo.lat + 0.0000001, lng: duomo.lng }, [stop('a', 45.47, 9.18)]);
    const c = itinerarySignature('Milano', 'Centro', duomo, [stop('a', 45.47, 9.18, { time: '11:00' })]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('isValidLatLng', () => {
  it('accepts finite coordinates inside the valid ranges', () => {
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidLatLng({ lat: -90, lng: 180 })).toBe(true);
  });

  it('rejects out-of-range, non-numeric and missing values', () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: '45', lng: 9 })).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lng: 9 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});
