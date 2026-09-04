'use client';

import { useCallback, useState } from 'react';

import type { Auth0Status } from '@/hooks/use-auth0';
import { api, type AuthHeaders } from '@/lib/api';
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
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [status, setStatus] = useState<'error' | 'idle' | 'loading'>('idle');
  const [saveStatus, setSaveStatus] = useState<'error' | 'idle' | 'saving'>('idle');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const headers = useCallback(async (): Promise<AuthHeaders> => {
    const token = authStatus === 'authenticated' ? await getAccessToken() : null;
    if (authStatus === 'authenticated' && !token) throw new Error('authentication required');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [authStatus, getAccessToken]);

  const load = useCallback(async () => {
    if (authStatus === 'anonymous') return;
    setStatus('loading');
    try {
      const data = await api.itineraries.list(await headers());
      setRoutes(Array.isArray(data.routes) ? data.routes : []);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, [authStatus, headers]);

  const save = useCallback(async ({ signature, ...payload }: SaveRoutePayload) => {
    setSaveStatus('saving');
    try {
      const data = await api.itineraries.save({ id: activeId, ...payload }, await headers());
      const route = data.route;
      if (!route) throw new Error('route missing');
      setActiveId(route.id);
      setSavedSignature(signature);
      setRoutes((current) => [route, ...current.filter((item) => item.id !== route.id)]);
      setSaveStatus('idle');
      return route;
    } catch {
      setSaveStatus('error');
      return null;
    }
  }, [activeId, headers]);

  const remove = useCallback(async (routeId: string) => {
    setDeletingId(routeId);
    try {
      await api.itineraries.remove(routeId, await headers());
      setRoutes((current) => current.filter((route) => route.id !== routeId));
      if (activeId === routeId) {
        setActiveId(null);
        setSavedSignature(null);
      }
    } catch {
      setStatus('error');
    } finally {
      setDeletingId(null);
    }
  }, [activeId, headers]);

  /** Marks a stored route as the one currently open on the map. */
  const markActive = useCallback((route: SavedRoute, signature: string) => {
    setActiveId(route.id);
    setSavedSignature(signature);
    setSaveStatus('idle');
  }, []);

  return { routes, status, saveStatus, deletingId, savedSignature, load, save, remove, markActive };
}
