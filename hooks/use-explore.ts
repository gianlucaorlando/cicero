'use client';

import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { exploreRadius, isCovered, mergePlaces, MIN_EXPLORE_ZOOM, type Circle, type Viewport } from '@/lib/explore';
import type { DiscoveryPlace } from '@/lib/types';

/** Wait for the map to settle: a fling or a pinch fires many moves, one lookup is enough. */
const SETTLE_MS = 600;

/**
 * Places for the area on screen, gathered as the user pans and zooms. Areas
 * already covered are not asked again, so going back and forth costs nothing;
 * a failed lookup just leaves the pins that were already there.
 */
export function useExplore(viewport: Viewport | null) {
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const fetched = useRef<Circle[]>([]);

  useEffect(() => {
    if (!viewport || viewport.zoom < MIN_EXPLORE_ZOOM) return;
    const wanted: Circle = { center: viewport.center, radiusMeters: exploreRadius(viewport.radiusMeters) };
    if (isCovered(fetched.current, wanted)) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      api.explore(wanted.center, wanted.radiusMeters, controller.signal)
        .then((data) => {
          fetched.current = [...fetched.current, wanted].slice(-60);
          setPlaces((current) => mergePlaces(current, data.places ?? []));
        })
        .catch(() => undefined);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [viewport]);

  return places;
}
