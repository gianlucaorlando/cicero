import type { Profile } from '@/lib/profile';
import type { ChatRequest, ChatResponse, LatLng, SavedRoute, Stop } from '@/lib/types';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message || code);
  }
}

export type AuthHeaders = Record<string, string>;
type Headers = AuthHeaders;

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(response.status, data.error || `HTTP_${response.status}`, data.message);
  return data;
}

function jsonInit(method: string, body: unknown, headers: Headers = {}, signal?: AbortSignal): RequestInit {
  return { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal };
}

export const api = {
  chat(payload: ChatRequest, headers: Headers = {}) {
    return request<ChatResponse>('/api/chat', jsonInit('POST', payload, headers));
  },

  profile: {
    get(headers: Headers) {
      return request<{ profile: unknown; exists: boolean }>('/api/profile/preferences', { headers });
    },
    put(profile: Profile, headers: Headers, signal?: AbortSignal) {
      return request<{ profile: unknown }>('/api/profile/preferences', jsonInit('PUT', profile, headers, signal));
    },
  },

  itineraries: {
    list(headers: Headers) {
      return request<{ routes: SavedRoute[] }>('/api/itineraries', { headers });
    },
    save(payload: { id: string | null; name: string; city: string; locationLabel: string; origin: LatLng; stops: Stop[] }, headers: Headers) {
      return request<{ route: SavedRoute | null }>('/api/itineraries', jsonInit('POST', payload, headers));
    },
    remove(id: string, headers: Headers) {
      return request<{ deleted: boolean }>(`/api/itineraries?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    },
  },
};

type NominatimResult = {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: { city?: string; town?: string; municipality?: string; road?: string; pedestrian?: string; neighbourhood?: string };
};

export type GeocodeResult = { coords: LatLng; city: string | null; label: string };

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`);
  const [result] = await response.json() as NominatimResult[];
  if (!result) return null;
  return {
    coords: { lat: Number(result.lat), lng: Number(result.lon) },
    city: result.address?.city || result.address?.town || result.address?.municipality || null,
    label: result.display_name?.split(',')[0] || query,
  };
}

export async function reverseGeocode(coords: LatLng): Promise<Omit<GeocodeResult, 'coords'>> {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${coords.lat}&lon=${coords.lng}`);
  const result = await response.json() as NominatimResult;
  return {
    city: result.address?.city || result.address?.town || result.address?.municipality || null,
    label: result.name || result.address?.road || result.address?.pedestrian || result.address?.neighbourhood || 'pin spostato',
  };
}

export async function fetchWeatherLabel(coords: LatLng, signal: AbortSignal) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,precipitation&hourly=precipitation_probability&forecast_hours=6&timezone=auto`;
  const response = await fetch(url, { signal });
  const data = await response.json() as {
    current?: { temperature_2m?: number; precipitation?: number };
    hourly?: { precipitation_probability?: number[] };
  };
  const temp = Math.round(data.current?.temperature_2m ?? 0);
  const rainNow = Number(data.current?.precipitation ?? 0);
  const peak = Math.max(...(data.hourly?.precipitation_probability ?? [0]));
  return rainNow > 0 ? `${temp}° · piove ora` : `${temp}° · pioggia ${peak}%`;
}
