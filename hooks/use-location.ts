'use client';

import { useCallback, useState } from 'react';

import { geocode, reverseGeocode } from '@/lib/api';
import type { LatLng, SavedRoute } from '@/lib/types';

const DEFAULT_CITY = 'Milano';
const DEFAULT_LABEL = 'Centro';
const DEFAULT_COORDS: LatLng = { lat: 45.4642, lng: 9.19 };

type Notify = (text: string, meta?: string) => void;

/** Origin point, city label and the geocoding flows that move them. */
export function useLocation(notify: Notify) {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [cityInput, setCityInput] = useState(DEFAULT_CITY);
  const [addressInput, setAddressInput] = useState('');
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LABEL);
  const [coords, setCoords] = useState<LatLng>(DEFAULT_COORDS);
  const [locating, setLocating] = useState(false);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      notify('Questo browser non condivide la posizione. Puoi indicarmi una città dal chip in alto.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setCity('Qui vicino');
        setLocationLabel('posizione attuale');
        setLocating(false);
        notify('Posizione aggiornata. Prima di proporti una tappa controllerò raggio, apertura e meteo.', 'GPS aggiornato ora');
      },
      () => {
        setLocating(false);
        notify('Non riesco ad accedere al GPS. Puoi indicarmi una città dal chip in alto.');
      },
      { enableHighAccuracy: true, timeout: 9000 },
    );
  }, [notify]);

  const findLocation = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return false;
    setLocating(true);
    try {
      const result = await geocode(trimmed);
      if (!result) throw new Error('not found');
      setCoords(result.coords);
      setCity((current) => result.city || current);
      setLocationLabel(result.label);
      setAddressInput(result.label);
      notify(`Ho spostato il punto di partenza su ${result.label}. Le tappe esistenti restano intatte.`, 'Pin e contesto aggiornati');
      return true;
    } catch {
      notify(`Non trovo “${trimmed}” con sufficiente certezza. Prova con città e Paese.`);
      return false;
    } finally {
      setLocating(false);
    }
  }, [notify]);

  const movePin = useCallback(async (next: LatLng) => {
    setCoords(next);
    setLocationLabel('pin spostato');
    try {
      const result = await reverseGeocode(next);
      setLocationLabel(result.label);
      setAddressInput(result.label);
      if (result.city) setCity(result.city);
      notify(`Partiamo da ${result.label}. Ho lasciato le tappe intatte; tempi e distanze useranno questo nuovo punto.`, 'Pin spostato sulla mappa');
    } catch {
      notify('Ho aggiornato il punto di partenza alle coordinate del pin. L’indirizzo non è disponibile.', 'Coordinate aggiornate');
    }
  }, [notify]);

  const applySavedRoute = useCallback((route: SavedRoute) => {
    setCity(route.city);
    setCityInput(route.city);
    setLocationLabel(route.locationLabel);
    setAddressInput(route.locationLabel);
    setCoords(route.origin);
  }, []);

  return {
    city,
    cityInput,
    setCityInput,
    addressInput,
    setAddressInput,
    locationLabel,
    coords,
    locating,
    useCurrentLocation,
    findLocation,
    movePin,
    applySavedRoute,
  };
}
