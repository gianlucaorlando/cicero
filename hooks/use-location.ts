'use client';

import { useCallback, useRef, useState } from 'react';

import { geocode, reverseGeocode } from '@/lib/api';
import type { LatLng, SavedRoute } from '@/lib/types';

const DEFAULT_CITY = 'Roma';
const DEFAULT_LABEL = 'Centro';
/** Piazza Venezia: the conventional centre of Rome, and the fallback until the user says otherwise. */
const DEFAULT_COORDS: LatLng = { lat: 41.8959, lng: 12.4823 };

export type Relocation = { coords: LatLng; label: string; city: string };

type Params = {
  /** Error or status message for the user (GPS denied, address not found). */
  notify: (text: string, meta?: string) => void;
  /** The origin moved successfully: Cicerone should react and propose something nearby. */
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
  /** Only the newest geocode answer may write: a slower earlier one would undo it. */
  const request = useRef(0);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      notify('Questo browser non condivide la posizione. Puoi indicarmi una città dal chip in alto.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        request.current += 1;
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
    const ticket = ++request.current;
    setLocating(true);
    try {
      const result = await geocode(trimmed);
      if (!result) throw new Error('not found');
      if (ticket !== request.current) return false;
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
    const ticket = ++request.current;
    setCoords(next);
    setLocationLabel('pin spostato');
    let label = 'il punto scelto sulla mappa';
    let nextCity = city;
    try {
      const result = await reverseGeocode(next);
      if (ticket !== request.current) return;
      label = result.label;
      nextCity = result.city || city;
      setLocationLabel(result.label);
      setAddressInput(result.label);
      if (result.city) setCity(result.city);
    } catch {
      // The pin still moved; the address is simply unknown.
      if (ticket !== request.current) return;
    }
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
