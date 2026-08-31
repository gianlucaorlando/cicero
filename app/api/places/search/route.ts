import { getD1 } from '@/db';

type SearchPayload = {
  query?: unknown;
  lat?: unknown;
  lng?: unknown;
  radiusMeters?: unknown;
  openNow?: unknown;
};

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

type GooglePlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
  businessStatus: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
};

type TripadvisorSummary = {
  locationId: string;
  rating: number;
  reviewCount: number;
  ratingImageUrl: string;
  webUrl: string;
};

const TRIPADVISOR_CACHE_SQL = `
  CREATE TABLE IF NOT EXISTS place_review_cache (
    place_id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

let cacheSchemaReady: Promise<void> | null = null;

async function ensureCacheSchema() {
  if (!cacheSchemaReady) {
    const d1 = getD1();
    cacheSchemaReady = d1.prepare(TRIPADVISOR_CACHE_SQL).run().then(() => undefined).catch((error) => {
      cacheSchemaReady = null;
      throw error;
    });
  }
  await cacheSchemaReady;
}

function normalizedName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameMatchScore(left: string, right: string) {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return 2;

  const aTokens = new Set(a.split(' ').filter((token) => token.length > 2));
  const bTokens = new Set(b.split(' ').filter((token) => token.length > 2));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  return shared >= Math.max(1, Math.min(aTokens.size, bTokens.size) * 0.6) ? 1 : 0;
}

function safeTripadvisorUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const allowed = url.hostname.includes('tripadvisor.') || url.hostname.endsWith('.tacdn.com');
    return url.protocol === 'https:' && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function tripadvisorCategory(primaryType: string) {
  return /restaurant|cafe|coffee|bakery|bar/.test(primaryType) ? 'restaurants' : 'attractions';
}

async function readCachedTripadvisor(placeId: string) {
  try {
    await ensureCacheSchema();
    const row = await getD1()
      .prepare('SELECT payload, expires_at FROM place_review_cache WHERE place_id = ? AND provider = ?')
      .bind(placeId, 'tripadvisor')
      .first<{ payload: string; expires_at: number }>();
    if (!row || row.expires_at <= Date.now()) return undefined;
    return JSON.parse(row.payload) as TripadvisorSummary | null;
  } catch {
    return undefined;
  }
}

async function cacheTripadvisor(placeId: string, value: TripadvisorSummary | null) {
  try {
    await ensureCacheSchema();
    await getD1()
      .prepare(`
        INSERT INTO place_review_cache (place_id, provider, payload, expires_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(place_id) DO UPDATE SET
          provider = excluded.provider,
          payload = excluded.payload,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(placeId, 'tripadvisor', JSON.stringify(value), Date.now() + 6 * 60 * 60 * 1000)
      .run();
  } catch { /* review enrichment must never block Places */ }
}

async function fetchTripadvisorSummary(place: GooglePlace, apiKey: string): Promise<TripadvisorSummary | null> {
  const cached = await readCachedTripadvisor(place.id);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const searchUrl = new URL('https://api.content.tripadvisor.com/api/v1/location/search');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('searchQuery', place.name);
    searchUrl.searchParams.set('category', tripadvisorCategory(place.primaryType));
    searchUrl.searchParams.set('address', place.address);
    searchUrl.searchParams.set('latLong', `${place.lat},${place.lng}`);
    searchUrl.searchParams.set('radius', '500');
    searchUrl.searchParams.set('radiusUnit', 'm');
    searchUrl.searchParams.set('language', 'it');

    const searchResponse = await fetch(searchUrl, { signal: controller.signal });
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json() as {
      data?: Array<{ location_id?: number | string; name?: string }>;
    };
    const match = (searchData.data || [])
      .map((candidate) => ({ ...candidate, score: nameMatchScore(place.name, candidate.name || '') }))
      .sort((left, right) => right.score - left.score)[0];
    if (!match?.location_id || match.score < 1) {
      await cacheTripadvisor(place.id, null);
      return null;
    }

    const detailsUrl = new URL(`https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(String(match.location_id))}/details`);
    detailsUrl.searchParams.set('key', apiKey);
    detailsUrl.searchParams.set('language', 'it');
    detailsUrl.searchParams.set('currency', 'EUR');
    const detailsResponse = await fetch(detailsUrl, { signal: controller.signal });
    if (!detailsResponse.ok) return null;
    const details = await detailsResponse.json() as {
      location_id?: number | string;
      name?: string;
      rating?: number;
      rating_image_url?: string;
      num_reviews?: string | number;
      web_url?: string;
    };

    const ratingImageUrl = safeTripadvisorUrl(details.rating_image_url);
    const webUrl = safeTripadvisorUrl(details.web_url);
    const rating = Number(details.rating);
    const reviewCount = Number(details.num_reviews);
    if (
      nameMatchScore(place.name, details.name || '') < 1
      || !Number.isFinite(rating)
      || rating <= 0
      || !Number.isFinite(reviewCount)
      || reviewCount < 1
      || !ratingImageUrl
      || !webUrl
    ) {
      await cacheTripadvisor(place.id, null);
      return null;
    }

    const summary = {
      locationId: String(details.location_id || match.location_id),
      rating,
      reviewCount,
      ratingImageUrl,
      webUrl,
    };
    await cacheTripadvisor(place.id, summary);
    return summary;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'PLACES_NOT_CONFIGURED', message: 'Google Places non è ancora configurato.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: SearchPayload;
  try {
    payload = await request.json() as SearchPayload;
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const query = typeof payload.query === 'string' ? payload.query.trim().slice(0, 120) : '';
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const radiusMeters = Math.min(5000, Math.max(100, Number(payload.radiusMeters) || 1200));
  const openNow = payload.openNow !== false;

  if (!query || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const googleResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'it',
      pageSize: 6,
      openNow,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }),
  });

  const data = await googleResponse.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      primaryType?: string;
      businessStatus?: string;
      googleMapsUri?: string;
      rating?: number;
      userRatingCount?: number;
    }>;
    error?: { message?: string; status?: string };
  };

  if (!googleResponse.ok) {
    return Response.json(
      { error: 'PLACES_UPSTREAM_ERROR', message: data.error?.message || 'Places non disponibile.' },
      { status: googleResponse.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const places: GooglePlace[] = (data.places || [])
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
    }));

  const tripadvisorApiKey = process.env.TRIPADVISOR_API_KEY;
  const enrichedPlaces = tripadvisorApiKey
    ? await Promise.all(places.map(async (place) => ({
        ...place,
        tripadvisor: await fetchTripadvisorSummary(place, tripadvisorApiKey),
      })))
    : places.map((place) => ({ ...place, tripadvisor: null }));

  return Response.json(
    { places: enrichedPlaces, source: 'google_places', tripadvisorConfigured: Boolean(tripadvisorApiKey) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
