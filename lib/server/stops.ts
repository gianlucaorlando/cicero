import { isValidLatLng } from '@/lib/geo';
import { textValue } from '@/lib/server/http';
import type { Stop } from '@/lib/types';

function safeGoogleMapsUri(value: unknown) {
  const candidate = textValue(value, 1000);
  try {
    const url = new URL(candidate);
    const googleHost = /^(?:maps|www)\.google\.[a-z.]+$/i.test(url.hostname);
    return url.protocol === 'https:' && googleHost ? candidate : null;
  } catch {
    return null;
  }
}

/** Validates an untrusted stop payload (from the client or from storage). */
export function normalizeStop(value: unknown, index: number): Stop | null {
  if (!value || typeof value !== 'object') return null;
  const stop = value as Record<string, unknown>;
  const title = textValue(stop.title, 160);
  if (!isValidLatLng({ lat: stop.lat, lng: stop.lng }) || !title) return null;

  const rawKind = textValue(stop.kind, 12);
  return {
    id: textValue(stop.id, 180) || `stop-${index + 1}`,
    time: textValue(stop.time, 12),
    title,
    detail: textValue(stop.detail, 300),
    kind: rawKind === 'coffee' || rawKind === 'walk' ? rawKind : 'place',
    placeId: textValue(stop.placeId, 300) || undefined,
    primaryType: textValue(stop.primaryType, 80) || undefined,
    address: textValue(stop.address, 300) || undefined,
    lat: stop.lat as number,
    lng: stop.lng as number,
    googleMapsUri: safeGoogleMapsUri(stop.googleMapsUri),
    source: stop.source === 'google_places' ? 'google_places' : undefined,
  };
}

export function normalizeStops(value: unknown, max = 20): Stop[] {
  return Array.isArray(value)
    ? value.slice(0, max).map(normalizeStop).filter((stop): stop is Stop => stop !== null)
    : [];
}
