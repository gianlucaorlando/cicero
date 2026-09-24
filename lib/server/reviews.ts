import { newestFirst } from '@/lib/reviews';
import { isValidPlaceId, PlacesError } from '@/lib/server/places';
import { fetchTerraReviews, findTerraLocation } from '@/lib/server/tripadvisor';
import type { PlaceReview, PlaceReviews } from '@/lib/types';

/**
 * The latest reviews of a place, for the extended sheet. Google returns at
 * most five, chosen by relevance (Places API (New) has no "newest" order), so
 * they are shown newest first; Tripadvisor returns its most recent ones.
 */

/** `reviews` bills the Enterprise + Atmosphere SKU: fetched only when a sheet opens, then cached. */
const REVIEW_FIELDS = ['id', 'displayName', 'location', 'primaryType', 'googleMapsUri', 'rating', 'userRatingCount', 'reviews'].join(',');
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { expires: number; reviews: PlaceReviews }>();

type LocalizedText = { text?: string; languageCode?: string };

type GoogleReview = {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: LocalizedText;
  originalText?: LocalizedText;
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
  flagContentUri?: string;
  googleMapsUri?: string;
};

type GoogleReviewsPayload = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  reviews?: GoogleReview[];
  error?: { message?: string };
};

function httpsUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Google's review as shown: translated text when Google translated it, the original kept alongside. */
export function googleReviewFrom(raw: GoogleReview, index: number): PlaceReview | null {
  const text = raw.text?.text?.trim() || raw.originalText?.text?.trim();
  if (!text) return null;
  const original = raw.originalText?.text?.trim();
  const translated = Boolean(original && raw.originalText?.languageCode && raw.text?.languageCode
    && raw.originalText.languageCode !== raw.text.languageCode && original !== text);
  const rating = Number(raw.rating);
  return {
    id: raw.name || `google:${index}`,
    source: 'google',
    author: raw.authorAttribution?.displayName?.trim() || 'Utente Google',
    authorUri: httpsUrl(raw.authorAttribution?.uri),
    authorPhotoUri: httpsUrl(raw.authorAttribution?.photoUri),
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
    title: null,
    text,
    originalText: translated ? original! : null,
    publishedAt: raw.publishTime && !Number.isNaN(Date.parse(raw.publishTime)) ? new Date(raw.publishTime).toISOString() : null,
    relativeTime: raw.relativePublishTimeDescription?.trim() || null,
    reviewUri: httpsUrl(raw.googleMapsUri),
    flagUri: httpsUrl(raw.flagContentUri),
  };
}

async function fetchGoogle(placeId: string): Promise<GoogleReviewsPayload> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new PlacesError('PLACES_NOT_CONFIGURED', 'Google Places non è ancora configurato.', 503);
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': REVIEW_FIELDS },
  });
  const data = await response.json() as GoogleReviewsPayload;
  if (!response.ok) throw new PlacesError('PLACES_UPSTREAM_ERROR', data.error?.message || 'Recensioni non disponibili.', response.status);
  return data;
}

export function cachedReviews(placeId: string, now = Date.now()) {
  const hit = cache.get(placeId);
  return hit && hit.expires > now ? hit.reviews : null;
}

export async function getPlaceReviews(placeId: string, now = Date.now()): Promise<PlaceReviews> {
  if (!isValidPlaceId(placeId)) throw new PlacesError('INVALID_PLACE_ID', 'Place ID non valido.', 400);
  const hit = cachedReviews(placeId, now);
  if (hit) return hit;

  const place = await fetchGoogle(placeId);
  const google = {
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null,
    url: httpsUrl(place.googleMapsUri),
    reviews: newestFirst((place.reviews ?? []).map(googleReviewFrom).filter((review): review is PlaceReview => review !== null)),
  };

  // Tripadvisor is a bonus: without a key, without a match or when Terra fails, Google alone is shown.
  let tripadvisor: PlaceReviews['tripadvisor'] = null;
  const terraKey = process.env.TRIPADVISOR_API_KEY;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (terraKey && place.displayName?.text && lat != null && lng != null) {
    try {
      const match = await findTerraLocation({ id: placeId, name: place.displayName.text, lat, lng, primaryType: place.primaryType || '' }, terraKey);
      if (match) {
        const reviews = await fetchTerraReviews(match.locationId, terraKey);
        tripadvisor = { rating: match.rating, count: match.count, url: match.url, reviews: newestFirst(reviews) };
      }
    } catch (error) {
      console.error('tripadvisor reviews failed', error instanceof Error ? error.message : error);
    }
  }

  const reviews: PlaceReviews = { placeId, google, tripadvisor };
  cache.set(placeId, { expires: now + CACHE_TTL_MS, reviews });
  if (cache.size > 500) cache.clear();
  return reviews;
}

/** Test hook: the cache is module state. */
export function clearReviewsCache() {
  cache.clear();
}
