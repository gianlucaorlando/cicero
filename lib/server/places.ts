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
  types?: string[];
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

function candidateFrom(place: GooglePlacePayload, from: LatLng): PlaceCandidate | null {
  if (!place.id || !place.displayName?.text || place.location?.latitude == null || place.location?.longitude == null) return null;
  const point = { lat: place.location.latitude, lng: place.location.longitude };
  return {
    id: place.id,
    name: place.displayName.text,
    address: place.formattedAddress || '',
    ...point,
    primaryType: place.primaryType || 'point_of_interest',
    businessStatus: place.businessStatus || null,
    googleMapsUri: place.googleMapsUri || null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    distanceMeters: distanceMeters(from, point),
    tripadvisor: null,
  };
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
    .map((place) => candidateFrom(place, input.origin))
    .filter((place): place is PlaceCandidate => place !== null);

  const tripadvisorApiKey = process.env.TRIPADVISOR_API_KEY;
  return Promise.all(places.map(async (place) => ({
    ...place,
    tripadvisor: tripadvisorApiKey ? await fetchTripadvisorSummary(place, tripadvisorApiKey) : null,
  })));
}

/** Google types that make a place worth walking to, for popularity-ranked nearby searches. */
export const SIGHT_TYPES = [
  'tourist_attraction', 'historical_landmark', 'monument', 'church', 'museum', 'art_gallery',
  'plaza', 'fountain', 'cultural_landmark', 'historical_place', 'sculpture',
];

/**
 * Places to eat and drink. Hotels and supermarkets with a bar come back too
 * (the type can be secondary): callers keep only food by primary type.
 */
export const FOOD_TYPES = [
  'restaurant', 'pizza_restaurant', 'italian_restaurant', 'fast_food_restaurant', 'cafe', 'coffee_shop',
  'bar', 'wine_bar', 'pub', 'bakery', 'ice_cream_shop', 'dessert_shop', 'sandwich_shop',
];

/**
 * The most popular places of the given types within a radius, strictly inside
 * it. A text search ranks either by distance (minor chapels first) or by
 * relevance (anywhere in the city); a nearby search by popularity returns the
 * Trevi Fountain and Piazza Navona for the Pantheon.
 */
export async function findPopularNearby(center: LatLng, radiusMeters: number, includedTypes: string[], maxResults = 20): Promise<PlaceCandidate[]> {
  const apiKey = requireApiKey();
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': SEARCH_FIELDS },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: Math.min(20, Math.max(1, maxResults)),
      rankPreference: 'POPULARITY',
      languageCode: 'it',
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(5000, Math.max(100, radiusMeters)) } },
    }),
  });
  const data = await response.json() as { places?: GooglePlacePayload[]; error?: { message?: string } };
  if (!response.ok) {
    throw new PlacesError('PLACES_UPSTREAM_ERROR', data.error?.message || 'Places non disponibile.', response.status);
  }
  return (data.places || []).map((place) => candidateFrom(place, center)).filter((place): place is PlaceCandidate => place !== null);
}

/** The most popular sights around a monument, for the walk Cicerone offers. */
export function findSightsNearby(center: LatLng, radiusMeters: number) {
  return findPopularNearby(center, radiusMeters, SIGHT_TYPES, 15);
}

const HUB_FIELDS = ['places.id', 'places.displayName', 'places.types', 'places.location'].join(',');

export type TransitHub = { name: string; type: 'train_station' | 'airport'; distanceMeters: number };

/** Train stations and airports near the origin, nearest first. */
export async function findTransitHubs(origin: LatLng, radiusMeters = 1500): Promise<TransitHub[]> {
  const apiKey = requireApiKey();
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': HUB_FIELDS },
    body: JSON.stringify({
      includedTypes: ['train_station', 'airport'],
      maxResultCount: 5,
      rankPreference: 'DISTANCE',
      languageCode: 'it',
      locationRestriction: { circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius: radiusMeters } },
    }),
  });
  const data = await response.json() as { places?: GooglePlacePayload[]; error?: { message?: string } };
  if (!response.ok) {
    throw new PlacesError('PLACES_UPSTREAM_ERROR', data.error?.message || 'Places non disponibile.', response.status);
  }
  return (data.places || [])
    .filter((place) => place.displayName?.text && place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      name: place.displayName!.text!,
      type: place.types?.includes('airport') ? 'airport' as const : 'train_station' as const,
      distanceMeters: distanceMeters(origin, { lat: place.location!.latitude!, lng: place.location!.longitude! }),
    }));
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
