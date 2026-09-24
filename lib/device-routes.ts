import { isValidLatLng } from '@/lib/geo';
import type { LatLng, SavedRoute, Stop } from '@/lib/types';

/**
 * Routes kept on this device, for when the server cannot tell who the user is
 * (no Auth0 and no trusted host identity). Saving must still work there: a
 * traveller who taps "Salva percorso" expects to find the route again.
 */
export const DEVICE_ROUTES_KEY = 'cicero-saved-routes-v1';
export const MAX_DEVICE_ROUTES = 30;

export type RouteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DeviceRouteInput = {
  id: string | null;
  name: string;
  city: string;
  locationLabel: string;
  origin: LatLng;
  stops: Stop[];
};

function isStop(value: unknown): value is Stop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as Record<string, unknown>;
  return typeof stop.id === 'string' && typeof stop.title === 'string' && typeof stop.time === 'string' && isValidLatLng(stop);
}

function isRoute(value: unknown): value is SavedRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as Record<string, unknown>;
  return typeof route.id === 'string' && typeof route.name === 'string' && typeof route.city === 'string'
    && typeof route.locationLabel === 'string' && isValidLatLng(route.origin)
    && Array.isArray(route.stops) && route.stops.length > 0 && route.stops.every(isStop)
    && typeof route.createdAt === 'string' && typeof route.updatedAt === 'string';
}

export function deviceStorage(): RouteStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can be blocked outright (private mode, disabled site data).
    return null;
  }
}

/** Stored routes, newest first. Anything unreadable is skipped rather than failing the whole list. */
export function readDeviceRoutes(storage: RouteStorage | null): SavedRoute[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DEVICE_ROUTES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRoute).map((route) => ({ ...route, device: true })) : [];
  } catch {
    return [];
  }
}

function writeRoutes(storage: RouteStorage, routes: SavedRoute[]) {
  storage.setItem(DEVICE_ROUTES_KEY, JSON.stringify(routes.slice(0, MAX_DEVICE_ROUTES)));
}

/**
 * Stores a route, overwriting the one `input.id` names when it exists, and
 * returns it. Throws when the storage is full or blocked.
 */
export function saveDeviceRoute(
  storage: RouteStorage,
  input: DeviceRouteInput,
  now = new Date(),
  newId: () => string = () => crypto.randomUUID(),
): SavedRoute {
  const routes = readDeviceRoutes(storage);
  const existing = input.id ? routes.find((route) => route.id === input.id) : undefined;
  const stamp = now.toISOString();
  const route: SavedRoute = {
    id: existing?.id ?? newId(),
    name: input.name,
    city: input.city,
    locationLabel: input.locationLabel,
    origin: input.origin,
    stops: input.stops,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    device: true,
  };
  writeRoutes(storage, [route, ...routes.filter((item) => item.id !== route.id)]);
  return route;
}

export function deleteDeviceRoute(storage: RouteStorage, id: string): SavedRoute[] {
  const routes = readDeviceRoutes(storage).filter((route) => route.id !== id);
  writeRoutes(storage, routes);
  return routes;
}

/** D1 stores "YYYY-MM-DD HH:MM:SS" in UTC, the device ISO strings: compare them as instants. */
function routeTime(value: string) {
  const time = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(time) ? 0 : time;
}

/** Profile and device routes in one list, most recently updated first. */
export function mergeRoutes(server: SavedRoute[], device: SavedRoute[]): SavedRoute[] {
  const serverIds = new Set(server.map((route) => route.id));
  return [...server, ...device.filter((route) => !serverIds.has(route.id))]
    .sort((left, right) => routeTime(right.updatedAt) - routeTime(left.updatedAt));
}
