'use client';

import { useCallback, useState } from 'react';

import { geocode, reverseGeocode } from '@/lib/api';
import type { LatLng, SavedRoute } from '@/lib/types';

const DEFAULT_CITY = 'Milano';
const DEFAULT_LABEL = 'Centro';
const DEFAULT_COORDS: LatLng = { lat: 45.4642, lng: 9.19 };

export type Relocation = { coords: LatLng; label: string; city: string };

type Params = {
  /** Error or status message for the user (GPS denied, address not found). */
  notify: (text: string, meta?: string) => void;
  /** The origin moved successfully: Cicero should react and propose something nearby. */
  onRelocated: (relocation: Relocation) => void;
};

/** Origin point, city label and the geocoding flows that move them. */
export function useLocation({ notify, onRelocated }: Params) {
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
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(next);
        setCity('Qui vicino');
        setLocationLabel('posizione attuale');
        setLocating(false);
        onRelocated({ coords: next, label: 'la tua posizione attuale', city: 'qui vicino' });
      },
      () => {
        setLocating(false);
        notify('Non riesco ad accedere al GPS. Puoi indicarmi una città dal chip in alto.');
      },
      { enableHighAccuracy: true, timeout: 9000 },
    );
  }, [notify, onRelocated]);

  const findLocation = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return false;
    setLocating(true);
    try {
      const result = await geocode(trimmed);
      if (!result) throw new Error('not found');
      const nextCity = result.city || city;
      setCoords(result.coords);
      setCity(nextCity);
      setLocationLabel(result.label);
      setAddressInput(result.label);
      onRelocated({ coords: result.coords, label: result.label, city: nextCity });
      return true;
    } catch {
      notify(`Non trovo “${trimmed}” con sufficiente certezza. Prova con città e Paese.`);
      return false;
    } finally {
      setLocating(false);
    }
  }, [city, notify, onRelocated]);

  const movePin = useCallback(async (next: LatLng) => {
    setCoords(next);
    setLocationLabel('pin spostato');
    let label = 'il punto scelto sulla mappa';
    let nextCity = city;
    try {
      const result = await reverseGeocode(next);
      label = result.label;
      nextCity = result.city || city;
      setLocationLabel(result.label);
      setAddressInput(result.label);
      if (result.city) setCity(result.city);
    } catch { /* the pin still moved; the address is simply unknown */ }
    onRelocated({ coords: next, label, city: nextCity });
  }, [city, onRelocated]);

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
