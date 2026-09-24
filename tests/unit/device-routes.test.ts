import { describe, expect, it } from 'vitest';

import {
  DEVICE_ROUTES_KEY,
  MAX_DEVICE_ROUTES,
  deleteDeviceRoute,
  mergeRoutes,
  readDeviceRoutes,
  saveDeviceRoute,
  type RouteStorage,
} from '@/lib/device-routes';
import type { SavedRoute, Stop } from '@/lib/types';

function memoryStorage(initial: Record<string, string> = {}): RouteStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
  };
}

const stop = (id: string): Stop => ({ id, placeId: id, time: '10:00', title: id, detail: '', kind: 'place', lat: 41.9, lng: 12.48 });

const input = (overrides: Partial<Parameters<typeof saveDeviceRoute>[1]> = {}) => ({
  id: null,
  name: 'Roma · 24 set',
  city: 'Roma',
  locationLabel: 'Piazza Venezia',
  origin: { lat: 41.8959, lng: 12.4823 },
  stops: [stop('pantheon'), stop('zi-rosetta')],
  ...overrides,
});

let counter = 0;
const nextId = () => `route-${++counter}`;

describe('device routes', () => {
  it('saves a route and reads it back flagged as a device route', () => {
    const storage = memoryStorage();
    const saved = saveDeviceRoute(storage, input(), new Date('2026-09-24T18:00:00Z'), nextId);
    expect(saved.device).toBe(true);
    expect(saved.createdAt).toBe('2026-09-24T18:00:00.000Z');
    const routes = readDeviceRoutes(storage);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ id: saved.id, name: 'Roma · 24 set', device: true });
    expect(routes[0].stops.map((s) => s.id)).toEqual(['pantheon', 'zi-rosetta']);
  });

  it('overwrites the route it is asked to update and keeps its creation date', () => {
    const storage = memoryStorage();
    const first = saveDeviceRoute(storage, input(), new Date('2026-09-24T18:00:00Z'), nextId);
    const updated = saveDeviceRoute(storage, input({ id: first.id, stops: [stop('pantheon')] }), new Date('2026-09-24T19:00:00Z'), nextId);
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.updatedAt).toBe('2026-09-24T19:00:00.000Z');
    expect(readDeviceRoutes(storage)).toHaveLength(1);
    expect(readDeviceRoutes(storage)[0].stops).toHaveLength(1);
  });

  it('creates a new route when the id to update is unknown here', () => {
    const storage = memoryStorage();
    const saved = saveDeviceRoute(storage, input({ id: 'server-route-id' }), new Date(), nextId);
    expect(saved.id).not.toBe('server-route-id');
    expect(readDeviceRoutes(storage)).toHaveLength(1);
  });

  it('keeps the newest routes first and caps how many are stored', () => {
    const storage = memoryStorage();
    for (let index = 0; index < MAX_DEVICE_ROUTES + 5; index += 1) {
      saveDeviceRoute(storage, input({ name: `giro ${index}` }), new Date(Date.UTC(2026, 8, 1, 0, index)), nextId);
    }
    const routes = readDeviceRoutes(storage);
    expect(routes).toHaveLength(MAX_DEVICE_ROUTES);
    expect(routes[0].name).toBe(`giro ${MAX_DEVICE_ROUTES + 4}`);
  });

  it('deletes one route and leaves the others', () => {
    const storage = memoryStorage();
    const keep = saveDeviceRoute(storage, input({ name: 'resta' }), new Date(), nextId);
    const drop = saveDeviceRoute(storage, input({ name: 'via' }), new Date(), nextId);
    expect(deleteDeviceRoute(storage, drop.id).map((route) => route.id)).toEqual([keep.id]);
    expect(readDeviceRoutes(storage).map((route) => route.id)).toEqual([keep.id]);
  });

  it('survives corrupted or tampered storage', () => {
    expect(readDeviceRoutes(memoryStorage({ [DEVICE_ROUTES_KEY]: '{not json' }))).toEqual([]);
    expect(readDeviceRoutes(memoryStorage({ [DEVICE_ROUTES_KEY]: '{"a":1}' }))).toEqual([]);
    const mixed = JSON.stringify([
      { id: 'no-stops', name: 'x', city: 'Roma', locationLabel: 'x', origin: { lat: 41.9, lng: 12.5 }, stops: [], createdAt: 'a', updatedAt: 'a' },
      { id: 'bad-origin', name: 'x', city: 'Roma', locationLabel: 'x', origin: { lat: 'x', lng: 12.5 }, stops: [stop('a')], createdAt: 'a', updatedAt: 'a' },
      { id: 'good', name: 'x', city: 'Roma', locationLabel: 'x', origin: { lat: 41.9, lng: 12.5 }, stops: [stop('a')], createdAt: 'a', updatedAt: 'a' },
    ]);
    expect(readDeviceRoutes(memoryStorage({ [DEVICE_ROUTES_KEY]: mixed })).map((route) => route.id)).toEqual(['good']);
    expect(readDeviceRoutes(null)).toEqual([]);
  });

  it('merges profile and device routes by recency, whatever the date format', () => {
    const route = (id: string, updatedAt: string, device?: boolean): SavedRoute => ({
      id, name: id, city: 'Roma', locationLabel: 'x', origin: { lat: 41.9, lng: 12.5 }, stops: [stop('a')],
      createdAt: updatedAt, updatedAt, device,
    });
    // D1 writes "YYYY-MM-DD HH:MM:SS" in UTC: 18:30 there is later than 18:00Z on the device.
    const merged = mergeRoutes(
      [route('server-old', '2026-09-23 10:00:00'), route('server-new', '2026-09-24 18:30:00')],
      [route('device', '2026-09-24T18:00:00.000Z', true), route('server-new', '2026-09-24T19:00:00.000Z', true)],
    );
    expect(merged.map((item) => item.id)).toEqual(['server-new', 'device', 'server-old']);
    expect(merged.find((item) => item.id === 'server-new')?.device).toBeUndefined();
  });
});
