import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({ getD1: () => { throw new Error('no D1 in unit tests'); } }));

import { relativeTimeLabel } from '@/lib/format';
import { latestReviews, newestFirst } from '@/lib/reviews';
import { clearReviewsCache, getPlaceReviews, googleReviewFrom } from '@/lib/server/reviews';
import { bestTerraMatch, pickTranslation, safeTripadvisorUrl, terraReviewFrom } from '@/lib/server/tripadvisor';
import type { PlaceReview } from '@/lib/types';

const PLACE_ID = 'ChIJ8aBMQ1JgLxMRKQN4KV6L9Hw';

const googleRaw = (overrides: Record<string, unknown> = {}) => ({
  name: `places/${PLACE_ID}/reviews/abc`,
  relativePublishTimeDescription: 'un mese fa',
  rating: 4,
  text: { text: 'Ottima carbonara, servizio veloce.', languageCode: 'it' },
  originalText: { text: 'Ottima carbonara, servizio veloce.', languageCode: 'it' },
  authorAttribution: { displayName: 'Giulia R.', uri: 'https://www.google.com/maps/contrib/1/reviews', photoUri: 'https://lh3.googleusercontent.com/a/x' },
  publishTime: '2026-08-02T10:00:00Z',
  flagContentUri: 'https://www.google.com/local/content/rap/report?postId=1',
  googleMapsUri: 'https://www.google.com/maps/reviews/data=1',
  ...overrides,
});

const review = (id: string, publishedAt: string | null, source: PlaceReview['source'] = 'google'): PlaceReview => ({
  id, source, author: id, authorUri: null, authorPhotoUri: null, rating: 5, title: null, text: id,
  originalText: null, publishedAt, relativeTime: null, reviewUri: null, flagUri: null,
});

describe('Google reviews', () => {
  it('keeps what Google requires to show a review: author, profile, avatar, link and report link', () => {
    expect(googleReviewFrom(googleRaw(), 0)).toEqual({
      id: `places/${PLACE_ID}/reviews/abc`,
      source: 'google',
      author: 'Giulia R.',
      authorUri: 'https://www.google.com/maps/contrib/1/reviews',
      authorPhotoUri: 'https://lh3.googleusercontent.com/a/x',
      rating: 4,
      title: null,
      text: 'Ottima carbonara, servizio veloce.',
      originalText: null,
      publishedAt: '2026-08-02T10:00:00.000Z',
      relativeTime: 'un mese fa',
      reviewUri: 'https://www.google.com/maps/reviews/data=1',
      flagUri: 'https://www.google.com/local/content/rap/report?postId=1',
    });
  });

  it('keeps the original next to a translation', () => {
    const translated = googleReviewFrom(googleRaw({
      text: { text: 'Il miglior calzone che abbia mai mangiato.', languageCode: 'it' },
      originalText: { text: 'El mejor calzone que he comido.', languageCode: 'es' },
    }), 0);
    expect(translated?.text).toBe('Il miglior calzone che abbia mai mangiato.');
    expect(translated?.originalText).toBe('El mejor calzone que he comido.');
  });

  it('drops empty reviews, unsafe links and impossible ratings', () => {
    expect(googleReviewFrom(googleRaw({ text: { text: '  ' }, originalText: undefined }), 0)).toBeNull();
    const odd = googleReviewFrom(googleRaw({ rating: 9, googleMapsUri: 'javascript:alert(1)', authorAttribution: { displayName: '' } }), 3)!;
    expect(odd.rating).toBeNull();
    expect(odd.reviewUri).toBeNull();
    expect(odd.author).toBe('Utente Google');
  });
});

describe('Tripadvisor (Terra)', () => {
  const nearby = {
    data: [
      { location: { id: 111, names: [{ language: 'it', value: 'Bar Tabacchi', primary: true }], traveler_ratings: { overall: { rating: 3.5, count: 20 } } } },
      {
        location: {
          id: 222,
          names: [{ language: 'it', value: 'La Locanda del Tempio', primary: true }],
          traveler_ratings: { overall: { rating: 4.5, count: 1830 } },
          urls: { tripadvisor: { main: 'https://www.tripadvisor.it/Restaurant_Review-g187791-d222' } },
        },
      },
    ],
  };
  const place = { id: PLACE_ID, name: 'La locanda del Tempio', lat: 41.9, lng: 12.47, primaryType: 'italian_restaurant' };

  it('matches the Google place to its Tripadvisor twin by name', () => {
    expect(bestTerraMatch(place, nearby)).toEqual({
      locationId: '222', rating: 4.5, count: 1830, url: 'https://www.tripadvisor.it/Restaurant_Review-g187791-d222',
    });
  });

  it('refuses a weak match rather than showing another place’s reviews', () => {
    expect(bestTerraMatch({ ...place, name: 'Pizzeria Da Mario' }, nearby)).toBeNull();
    expect(bestTerraMatch(place, { data: [] })).toBeNull();
    expect(bestTerraMatch(place, null)).toBeNull();
  });

  it('prefers the Italian translation and keeps the original', () => {
    expect(pickTranslation([
      { language: 'en', value: 'Great pasta', primary: true },
      { language: 'it', value: 'Ottima pasta' },
    ])).toEqual({ text: 'Ottima pasta', original: 'Great pasta' });
    expect(pickTranslation([{ language: 'fr', value: 'Très bon', primary: true }])).toEqual({ text: 'Très bon', original: null });
    expect(pickTranslation([])).toBeNull();
  });

  it('reads a review and only trusts Tripadvisor links', () => {
    const parsed = terraReviewFrom({
      id: 9001,
      title: [{ language: 'en', value: 'Lovely', primary: true }],
      text: [{ language: 'en', value: 'Lovely dinner by the Pantheon.', primary: true }],
      rating: 5,
      publish_ts: '2026-09-20T18:00:00Z',
      user: { username: 'traveller42' },
      url: 'https://www.tripadvisor.it/ShowUserReviews-g187791-d222-r9001',
    });
    expect(parsed).toMatchObject({
      id: 'tripadvisor:9001', source: 'tripadvisor', author: 'traveller42', rating: 5, title: 'Lovely',
      text: 'Lovely dinner by the Pantheon.', publishedAt: '2026-09-20T18:00:00.000Z',
      reviewUri: 'https://www.tripadvisor.it/ShowUserReviews-g187791-d222-r9001',
    });
    expect(safeTripadvisorUrl('https://evil.example/tripadvisor.it')).toBeNull();
    expect(safeTripadvisorUrl('http://www.tripadvisor.it/x')).toBeNull();
    expect(terraReviewFrom({ id: 1 })).toBeNull();
  });
});

describe('ordering', () => {
  it('shows the newest first, undated ones last in their original order', () => {
    const ordered = newestFirst([review('old', '2025-01-01T00:00:00Z'), review('undated-a', null), review('new', '2026-09-01T00:00:00Z'), review('undated-b', null)]);
    expect(ordered.map((item) => item.id)).toEqual(['new', 'old', 'undated-a', 'undated-b']);
  });

  it('merges both sources into one list', () => {
    const merged = latestReviews({
      placeId: PLACE_ID,
      google: { rating: 4.6, count: 9952, url: null, reviews: [review('g', '2026-08-01T00:00:00Z')] },
      tripadvisor: { rating: 4.5, count: 1830, url: null, reviews: [review('t', '2026-09-20T00:00:00Z', 'tripadvisor')] },
    });
    expect(merged.map((item) => item.id)).toEqual(['t', 'g']);
    expect(latestReviews(null)).toEqual([]);
  });

  it('says how long ago in Italian', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(relativeTimeLabel('2026-09-24T11:59:00Z', now)).toBe('poco fa');
    expect(relativeTimeLabel('2026-09-23T10:00:00Z', now)).toBe('ieri');
    expect(relativeTimeLabel('2026-09-10T12:00:00Z', now)).toBe('2 settimane fa');
    expect(relativeTimeLabel('2026-06-01T12:00:00Z', now)).toBe('3 mesi fa');
    expect(relativeTimeLabel('2024-09-01T12:00:00Z', now)).toBe('2 anni fa');
    expect(relativeTimeLabel('not a date', now)).toBeNull();
  });
});

describe('getPlaceReviews', () => {
  const fetchMock = vi.fn();
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  const googleBody = {
    id: PLACE_ID, displayName: { text: 'La locanda del Tempio' }, location: { latitude: 41.9, longitude: 12.47 },
    primaryType: 'italian_restaurant', googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.6, userRatingCount: 9952,
    reviews: [googleRaw({ publishTime: '2026-03-01T00:00:00Z' }), googleRaw({ name: 'b', publishTime: '2026-08-02T00:00:00Z' })],
  };

  beforeEach(() => {
    clearReviewsCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-google-key');
    vi.stubEnv('TRIPADVISOR_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns Google reviews newest first and asks for them only once per place', async () => {
    fetchMock.mockImplementation(() => json(googleBody));
    const first = await getPlaceReviews(PLACE_ID);
    expect(first.google?.reviews.map((item) => item.id)).toEqual(['b', `places/${PLACE_ID}/reviews/abc`]);
    expect(first.google).toMatchObject({ rating: 4.6, count: 9952, url: 'https://maps.google.com/?cid=1' });
    expect(first.tripadvisor).toBeNull();
    await getPlaceReviews(PLACE_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/v1/places/${PLACE_ID}?languageCode=it`);
    expect((init as RequestInit).headers).toMatchObject({ 'X-Goog-FieldMask': expect.stringContaining('reviews') });
  });

  it('adds Tripadvisor when a Terra key is set, and falls back to Google alone when Terra fails', async () => {
    vi.stubEnv('TRIPADVISOR_API_KEY', 'test-terra-key');
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('https://places.googleapis.com')) return json(googleBody);
      if (url.includes('/locations/nearby')) {
        return json({ data: [{ location: { id: 222, names: [{ value: 'La Locanda del Tempio', primary: true }], traveler_ratings: { overall: { rating: 4.5, count: 1830 } } } }] });
      }
      if (url.includes('/locations/222/reviews')) {
        return json({ data: [{ id: 7, text: [{ value: 'Cena perfetta.', primary: true }], rating: 5, publish_ts: '2026-09-20T00:00:00Z', user: { username: 'anna' } }] });
      }
      return json({}, 404);
    });
    const withTerra = await getPlaceReviews(PLACE_ID);
    expect(withTerra.tripadvisor).toMatchObject({ rating: 4.5, count: 1830 });
    expect(latestReviews(withTerra)[0]).toMatchObject({ source: 'tripadvisor', author: 'anna' });
    const terraCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://terra.tripadvisor.com'));
    expect(terraCalls.every(([, init]) => (init as RequestInit).headers && (init as { headers: Record<string, string> }).headers['X-API-Key'] === 'test-terra-key')).toBe(true);

    clearReviewsCache();
    fetchMock.mockImplementation((url: string) => (url.startsWith('https://places.googleapis.com') ? json(googleBody) : json({ error: 'down' }, 503)));
    const googleOnly = await getPlaceReviews(PLACE_ID);
    expect(googleOnly.tripadvisor).toBeNull();
    expect(googleOnly.google?.reviews).toHaveLength(2);
  });

  it('rejects invalid place ids before calling anyone', async () => {
    await expect(getPlaceReviews('../../etc')).rejects.toMatchObject({ code: 'INVALID_PLACE_ID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
