'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { AreaInfo, DiscoveryPlace, LatLng } from '@/lib/types';

const keyOf = (origin: LatLng) => `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;

type State = { key: string | null; places: DiscoveryPlace[]; area: AreaInfo | null };

/**
 * Points of interest around the origin, loaded as soon as the app opens and
 * again whenever the origin moves. `ready` is true once the answer (or the
 * failure) refers to the current origin, so callers never mix two places.
 */
export function useDiscovery(origin: LatLng) {
  const [state, setState] = useState<State>({ key: null, places: [], area: null });

  useEffect(() => {
    const controller = new AbortController();
    const key = keyOf(origin);
    api.discover(origin, controller.signal)
      .then((data) => setState({ key, places: data.places ?? [], area: data.area ?? null }))
      .catch(() => {
        // No points of interest is a degraded map, not an error worth interrupting the user for.
        if (!controller.signal.aborted) setState({ key, places: [], area: null });
      });
    return () => controller.abort();
  }, [origin]);

  const ready = state.key === keyOf(origin);
  return { places: ready ? state.places : [], area: ready ? state.area : null, ready };
}
