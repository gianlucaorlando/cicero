'use client';

import { useEffect, useState } from 'react';

import { fetchWeatherLabel } from '@/lib/api';
import type { LatLng } from '@/lib/types';

export function useWeather(coords: LatLng) {
  const [weather, setWeather] = useState('meteo in arrivo');

  useEffect(() => {
    const controller = new AbortController();
    fetchWeatherLabel(coords, controller.signal)
      .then(setWeather)
      .catch(() => {
        if (!controller.signal.aborted) setWeather('meteo non disponibile');
      });
    return () => controller.abort();
  }, [coords]);

  return weather;
}
