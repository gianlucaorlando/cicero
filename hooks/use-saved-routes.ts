'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Auth0Status } from '@/hooks/use-auth0';
import { api, ApiError, type AuthHeaders } from '@/lib/api';
import { deleteDeviceRoute, deviceStorage, mergeRoutes, readDeviceRoutes, saveDeviceRoute } from '@/lib/device-routes';
import type { LatLng, SavedRoute, Stop } from '@/lib/types';

type Params = {
  authStatus: Auth0Status;
  getAccessToken: () => Promise<string | null>;
};

export type SaveRoutePayload = {
  name: string;
  city: string;
  locationLabel: string;
  origin: LatLng;
  stops: Stop[];
  signature: string;
};

export function useSavedRoutes({ authStatus, getAccessToken }: Params) {
  const [serverRoutes, setServerRoutes] = useState<SavedRoute[]>([]);
  const [deviceRoutes, setDeviceRoutes] = useState<SavedRoute[]>([]);
  /**
   * Set once the server answered that it cannot tell who the user is (no Auth0,
   * no trusted host identity): from then on routes are kept on this device.
   */
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [status, setStatus] = useState<'error' | 'idle' | 'loading'>('idle');
  const [saveStatus, setSaveStatus] = useState<'error' | 'idle' | 'saving'>('idle');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** City of the route currently open: once the trip moves elsewhere, saving must create a new one. */
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // Read after mount: the server render has no storage, and the count must hydrate identically.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDeviceRoutes(readDeviceRoutes(deviceStorage())), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const headers = useCallback(async (): Promise<AuthHeaders> => {
    const token = authStatus === 'authenticated' ? await getAccessToken() : null;
    if (authStatus === 'authenticated' && !token) throw new Error('authentication required');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [authStatus, getAccessToken]);

  /** A signed-in user whose token failed must see the error; anyone else falls back to the device. */
  const serverCannotIdentify = useCallback(
    (error: unknown) => authStatus !== 'authenticated' && error instanceof ApiError && error.status === 401,
    [authStatus],
  );

  const load = useCallback(async () => {
    setDeviceRoutes(readDeviceRoutes(deviceStorage()));
    if (authStatus === 'anonymous' || deviceOnly) return;
    setStatus('loading');
    try {
      const data = await api.itineraries.list(await headers());
      setServerRoutes(Array.isArray(data.routes) ? data.routes : []);
      setStatus('idle');
    } catch (error) {
      if (serverCannotIdentify(error)) {
        setDeviceOnly(true);
        setStatus('idle');
        return;
      }
      setStatus('error');
    }
  }, [authStatus, deviceOnly, headers, serverCannotIdentify]);

  const save = useCallback(async ({ signature, ...payload }: SaveRoutePayload) => {
    setSaveStatus('saving');
    // Overwriting the open route is right only while the user is still editing that same trip.
    const updating = activeId && activeCity === payload.city ? activeId : null;
    const keepOnDevice = () => {
      const storage = deviceStorage();
      if (!storage) throw new Error('storage unavailable');
      const route = saveDeviceRoute(storage, { id: updating, ...payload });
      setDeviceRoutes(readDeviceRoutes(storage));
      return route;
    };

    try {
      let route: SavedRoute | null = null;
      if (deviceOnly && authStatus !== 'authenticated') {
        route = keepOnDevice();
      } else {
        try {
          const saved = (await api.itineraries.save({ id: updating, ...payload }, await headers())).route;
          if (saved) setServerRoutes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          route = saved;
        } catch (error) {
          if (!serverCannotIdentify(error)) throw error;
          setDeviceOnly(true);
          route = keepOnDevice();
        }
      }
      if (!route) throw new Error('route missing');
      setActiveId(route.id);
      setActiveCity(route.city);
      setSavedSignature(signature);
      setSaveStatus('idle');
      return route;
    } catch {
      setSaveStatus('error');
      return null;
    }
  }, [activeCity, activeId, authStatus, deviceOnly, headers, serverCannotIdentify]);

  const forgetActive = useCallback((routeId: string) => {
    if (activeId !== routeId) return;
    setActiveId(null);
    setActiveCity(null);
    setSavedSignature(null);
  }, [activeId]);

  const remove = useCallback(async (routeId: string) => {
    if (deviceRoutes.some((route) => route.id === routeId)) {
      const storage = deviceStorage();
      if (storage) setDeviceRoutes(deleteDeviceRoute(storage, routeId));
      forgetActive(routeId);
      return;
    }
    setDeletingId(routeId);
    try {
      await api.itineraries.remove(routeId, await headers());
      setServerRoutes((current) => current.filter((route) => route.id !== routeId));
      forgetActive(routeId);
    } catch {
      setStatus('error');
    } finally {
      setDeletingId(null);
    }
  }, [deviceRoutes, forgetActive, headers]);

  /** Marks a stored route as the one currently open on the map. */
  const markActive = useCallback((route: SavedRoute, signature: string) => {
    setActiveId(route.id);
    setActiveCity(route.city);
    setSavedSignature(signature);
    setSaveStatus('idle');
  }, []);

  return {
    routes: mergeRoutes(serverRoutes, deviceRoutes),
    status,
    saveStatus,
    deletingId,
    savedSignature,
    load,
    save,
    remove,
    markActive,
  };
}
