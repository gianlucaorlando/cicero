import { getD1 } from '@/db';
import { isFoodType } from '@/lib/place-kinds';
import { ensureSchema } from '@/lib/server/schema';
import type { PlaceReview, ReviewSummary } from '@/lib/types';

/**
 * Tripadvisor through Terra, its current API (the Content API it replaces
 * was switched off on 31 August 2026). Terra's terms allow showing reviews to
 * users with attribution and a link back, but not handing them to an AI
 * model without a separate agreement: nothing here ever reaches the agent.
 */
const TERRA_BASE = 'https://terra.tripadvisor.com/api';
const MATCH_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;
/** Terra's nearby search radius, in kilometres: a Google place and its Tripadvisor twin sit a few metres apart. */
const MATCH_RADIUS_KM = 0.25;

const CACHE_SCHEMA = [`
  CREATE TABLE IF NOT EXISTS place_review_cache (
    place_id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`];

export type PlaceForLookup = { id: string; name: string; lat: number; lng: number; primaryType: string };

export type TerraMatch = ReviewSummary & { locationId: string };

function normalizedName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function nameMatchScore(left: string, right: string) {
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

export function safeTripadvisorUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const allowed = /(^|\.)tripadvisor\.[a-z.]+$/.test(url.hostname) || url.hostname.endsWith('.tacdn.com');
    return url.protocol === 'https:' && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

type Translation = { language?: string; value?: string; primary?: boolean };

/** Italian when Terra has it, otherwise the text as written, otherwise the first one. */
export function pickTranslation(list: unknown, preferred = 'it'): { text: string; original: string | null } | null {
  if (!Array.isArray(list)) return typeof list === 'string' && list.trim() ? { text: list.trim(), original: null } : null;
  const entries = (list as Translation[]).filter((entry) => typeof entry?.value === 'string' && entry.value.trim());
  if (!entries.length) return null;
  const primary = entries.find((entry) => entry.primary) ?? entries[0];
  const wanted = entries.find((entry) => entry.language === preferred);
  const chosen = wanted ?? primary;
  return { text: chosen.value!.trim(), original: chosen !== primary ? primary.value!.trim() : null };
}

type TerraLocation = {
  id?: number | string;
  names?: Translation[];
  traveler_ratings?: { overall?: { rating?: number; count?: number } };
  urls?: { tripadvisor?: { main?: string } };
};

/** The nearby result that is really the same place: the best name match, never a weak one. */
export function bestTerraMatch(place: PlaceForLookup, data: unknown): TerraMatch | null {
  const rows = data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
    ? (data as { data: Array<{ location?: TerraLocation }> }).data
    : [];
  const scored = rows
    .map((row) => row.location)
    .filter((location): location is TerraLocation => Boolean(location?.id))
    .map((location) => ({ location, score: Math.max(0, ...(location.names ?? []).map((name) => nameMatchScore(place.name, name.value ?? ''))) }))
    .filter((item) => item.score >= 1)
    .sort((left, right) => right.score - left.score);
  const best = scored[0]?.location;
  if (!best) return null;
  const rating = Number(best.traveler_ratings?.overall?.rating);
  const count = Number(best.traveler_ratings?.overall?.count);
  return {
    locationId: String(best.id),
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    count: Number.isFinite(count) && count >= 0 ? count : null,
    url: safeTripadvisorUrl(best.urls?.tripadvisor?.main),
  };
}

type TerraReview = {
  id?: number | string;
  title?: unknown;
  text?: unknown;
  rating?: number;
  publish_ts?: string;
  user?: { username?: string };
  url?: string;
};

export function terraReviewFrom(raw: TerraReview): PlaceReview | null {
  const body = pickTranslation(raw.text);
  if (raw.id == null || !body) return null;
  const rating = Number(raw.rating);
  const published = raw.publish_ts && !Number.isNaN(Date.parse(raw.publish_ts)) ? new Date(raw.publish_ts).toISOString() : null;
  return {
    id: `tripadvisor:${raw.id}`,
    source: 'tripadvisor',
    author: raw.user?.username?.trim() || 'Viaggiatore Tripadvisor',
    authorUri: null,
    authorPhotoUri: null,
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
    title: pickTranslation(raw.title)?.text ?? null,
    text: body.text,
    originalText: body.original,
    publishedAt: published,
    relativeTime: null,
    reviewUri: safeTripadvisorUrl(raw.url),
    flagUri: null,
  };
}

async function terraGet(path: string, params: Record<string, string>, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${TERRA_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Terra ${path} answered ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCachedMatch(placeId: string): Promise<TerraMatch | null | undefined> {
  try {
    await ensureSchema('place_review_cache', CACHE_SCHEMA);
    const row = await getD1()
      .prepare('SELECT payload, expires_at FROM place_review_cache WHERE place_id = ? AND provider = ?')
      .bind(placeId, 'terra')
      .first<{ payload: string; expires_at: number }>();
    if (!row || row.expires_at <= Date.now()) return undefined;
    return JSON.parse(row.payload) as TerraMatch | null;
  } catch {
    return undefined;
  }
}

async function writeCachedMatch(placeId: string, match: TerraMatch | null) {
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
      .bind(placeId, 'terra', JSON.stringify(match), Date.now() + MATCH_TTL_MS)
      .run();
  } catch { /* a cache failure only costs one more lookup next time */ }
}

/** The Tripadvisor location of a Google place, cached for six hours (a miss too, so it is not searched again). */
export async function findTerraLocation(place: PlaceForLookup, apiKey: string): Promise<TerraMatch | null> {
  const cached = await readCachedMatch(place.id);
  if (cached !== undefined) return cached;
  const data = await terraGet('/locations/nearby', {
    version: '1',
    lat: String(place.lat),
    lon: String(place.lng),
    radius: String(MATCH_RADIUS_KM),
    unit: 'KM',
    category: isFoodType(place.primaryType) ? 'RESTAURANT' : 'ATTRACTION',
    sort: 'distance,asc',
    size: '10',
  }, apiKey);
  const match = bestTerraMatch(place, data);
  await writeCachedMatch(place.id, match);
  return match;
}

/** The most recent reviews of a Tripadvisor location, in whatever language they were written. */
export async function fetchTerraReviews(locationId: string, apiKey: string, size = 5): Promise<PlaceReview[]> {
  const data = await terraGet(`/locations/${encodeURIComponent(locationId)}/reviews`, {
    sort_by: 'MOST_RECENT',
    language: 'primary',
    size: String(size),
    page: '1',
  }, apiKey);
  const rows = data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
    ? (data as { data: TerraReview[] }).data
    : [];
  return rows.map(terraReviewFrom).filter((review): review is PlaceReview => review !== null);
}
