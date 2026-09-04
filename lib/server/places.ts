import { distanceMeters } from '@/lib/geo';
import { fetchTripadvisorSummary } from '@/lib/server/tripadvisor';
import type { LatLng, PlaceCandidate, PlaceDetails } from '@/lib/types';

export class PlacesError extends Error {
  constructor(readonly code: 'PLACES_NOT_CONFIGURED' | 'PLACES_UPSTREAM_ERROR' | 'INVALID_PLACE_ID', message: string, readonly status: number) {
    super(message);
  }
}

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
].join(',');

const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'primaryType',
  'businessStatus',
  'currentOpeningHours',
  'priceLevel',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'websiteUri',
].join(',');

type GooglePlacePayload = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    nextOpenTime?: string;
    nextCloseTime?: string;
    weekdayDescriptions?: string[];
  };
  priceLevel?: string;
  websiteUri?: string;
  error?: { message?: string; status?: string };
};

export type SearchPlacesInput = {
  query: string;
  origin: LatLng;
  radiusMeters?: number;
  openNow?: boolean;
  pageSize?: number;
};

function requireApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new PlacesError('PLACES_NOT_CONFIGURED', 'Google Places non è ancora configurato.', 503);
  return apiKey;
}

export function isValidPlaceId(id: string) {
  return /^[A-Za-z0-9_-]{8,300}$/.test(id);
}

export async function searchPlaces(input: SearchPlacesInput): Promise<PlaceCandidate[]> {
  const apiKey = requireApiKey();
  const query = input.query.trim().slice(0, 120);
  const radiusMeters = Math.min(5000, Math.max(100, input.radiusMeters || 1200));

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'it',
      pageSize: Math.min(10, Math.max(1, input.pageSize || 6)),
      openNow: input.openNow !== false,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: { center: { latitude: input.origin.lat, longitude: input.origin.lng }, radius: radiusMeters },
      },
    }),
  });

  const data = await response.json() as { places?: GooglePlacePayload[]; error?: { message?: string } };
  if (!response.ok) {
    throw new PlacesError('PLACES_UPSTREAM_ERROR', data.error?.message || 'Places non disponibile.', response.status);
  }

  const places = (data.places || [])
    .filter((place) => place.id && place.displayName?.text && place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      id: place.id!,
      name: place.displayName!.text!,
      address: place.formattedAddress || '',
      lat: place.location!.latitude!,
      lng: place.location!.longitude!,
      primaryType: place.primaryType || 'point_of_interest',
      businessStatus: place.businessStatus || null,
      googleMapsUri: place.googleMapsUri || null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      distanceMeters: distanceMeters(input.origin, { lat: place.location!.latitude!, lng: place.location!.longitude! }),
    }));

  const tripadvisorApiKey = process.env.TRIPADVISOR_API_KEY;
  return Promise.all(places.map(async (place) => ({
    ...place,
    tripadvisor: tripadvisorApiKey ? await fetchTripadvisorSummary(place, tripadvisorApiKey) : null,
  })));
}

export async function getPlaceDetails(id: string): Promise<PlaceDetails> {
  const apiKey = requireApiKey();
  if (!isValidPlaceId(id)) throw new PlacesError('INVALID_PLACE_ID', 'Place ID non valido.', 400);

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=it`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_FIELDS },
  });
  const place = await response.json() as GooglePlacePayload;
  if (!response.ok) {
    throw new PlacesError('PLACES_UPSTREAM_ERROR', place.error?.message || 'Dettagli non disponibili.', response.status);
  }
  if (place.location?.latitude == null || place.location?.longitude == null) {
    throw new PlacesError('PLACES_UPSTREAM_ERROR', 'Il luogo non ha coordinate.', 502);
  }

  return {
    id: place.id || id,
    name: place.displayName?.text || 'Luogo senza nome',
    address: place.formattedAddress || '',
    lat: place.location.latitude,
    lng: place.location.longitude,
    primaryType: place.primaryType || 'point_of_interest',
    businessStatus: place.businessStatus || null,
    openNow: place.currentOpeningHours?.openNow ?? null,
    nextOpenTime: place.currentOpeningHours?.nextOpenTime || null,
    nextCloseTime: place.currentOpeningHours?.nextCloseTime || null,
    weekdayDescriptions: place.currentOpeningHours?.weekdayDescriptions || [],
    priceLevel: place.priceLevel || null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    googleMapsUri: place.googleMapsUri || null,
    websiteUri: place.websiteUri || null,
  };
}
