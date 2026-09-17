'use client';

import { useEffect, useState } from 'react';

import { fetchWeatherLabel } from '@/lib/api';
import type { LatLng } from '@/lib/types';

export const WEATHER_PENDING = 'meteo in arrivo';

const keyOf = (coords: LatLng) => `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;

/**
 * Weather label for the origin. `ready` is false until the label refers to the
 * current coordinates, so callers never describe a new place with the old sky.
 */
export function useWeather(coords: LatLng) {
  const [state, setState] = useState<{ label: string; forCoords: string | null }>({ label: WEATHER_PENDING, forCoords: null });

  useEffect(() => {
    const controller = new AbortController();
    const key = keyOf(coords);
    fetchWeatherLabel(coords, controller.signal)
      .then((label) => setState({ label, forCoords: key }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ label: 'meteo non disponibile', forCoords: key });
      });
    return () => controller.abort();
  }, [coords]);

  const ready = state.forCoords === keyOf(coords);
  return { label: ready ? state.label : WEATHER_PENDING, ready };
}
