import { getD1 } from '@/db';
import { ensureSchema } from '@/lib/server/schema';
import type { TripadvisorSummary } from '@/lib/types';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3500;

const CACHE_SCHEMA = [`
  CREATE TABLE IF NOT EXISTS place_review_cache (
    place_id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`];

type PlaceForLookup = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
};

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

async function readCached(placeId: string) {
  try {
    await ensureSchema('place_review_cache', CACHE_SCHEMA);
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

async function writeCache(placeId: string, value: TripadvisorSummary | null) {
  try {
    await ensureSchema('place_review_cache', CACHE_SCHEMA);
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
      .bind(placeId, 'tripadvisor', JSON.stringify(value), Date.now() + CACHE_TTL_MS)
      .run();
  } catch { /* review enrichment must never block Places */ }
}

/** Looks up a Tripadvisor rating for a Google place. Returns null when no confident match exists. */
export async function fetchTripadvisorSummary(place: PlaceForLookup, apiKey: string): Promise<TripadvisorSummary | null> {
  const cached = await readCached(place.id);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
      await writeCache(place.id, null);
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
    const trustworthy = nameMatchScore(place.name, details.name || '') >= 1
      && Number.isFinite(rating) && rating > 0
      && Number.isFinite(reviewCount) && reviewCount >= 1
      && ratingImageUrl && webUrl;
    if (!trustworthy) {
      await writeCache(place.id, null);
      return null;
    }

    const summary: TripadvisorSummary = {
      locationId: String(details.location_id || match.location_id),
      rating,
      reviewCount,
      ratingImageUrl,
      webUrl,
    };
    await writeCache(place.id, summary);
    return summary;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
