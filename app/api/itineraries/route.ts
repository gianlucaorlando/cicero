import { getD1 } from '@/db';
import { getAuth0Config, getAuth0User } from '@/lib/auth0-server';

type SavedStop = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: 'coffee' | 'place' | 'walk';
  placeId?: string;
  primaryType?: string;
  address?: string;
  lat: number;
  lng: number;
  googleMapsUri?: string | null;
  source?: 'google_places';
};

type ItineraryRow = {
  id: string;
  name: string;
  city: string;
  location_label: string;
  origin_lat: number;
  origin_lng: number;
  stops: string;
  created_at: string;
  updated_at: string;
};

const CREATE_SAVED_ITINERARIES_SQL = `
  CREATE TABLE IF NOT EXISTS saved_itineraries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    location_label TEXT NOT NULL,
    origin_lat REAL NOT NULL,
    origin_lng REAL NOT NULL,
    stops TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1.batch([
      d1.prepare(CREATE_SAVED_ITINERARIES_SQL),
      d1.prepare('CREATE INDEX IF NOT EXISTS idx_saved_itineraries_user_updated_at ON saved_itineraries (user_id, updated_at)'),
      d1.prepare('PRAGMA optimize'),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function getItineraryUser(request: Request) {
  const auth0User = await getAuth0User(request);
  if (auth0User) return { userId: `auth0:${auth0User.userId}` };
  if (getAuth0Config()) return null;
  const sitesUserId = request.headers.get('oai-authenticated-user-id')?.trim();
  return sitesUserId ? { userId: `sites:${sitesUserId.slice(0, 249)}` } : null;
}

function unauthorized() {
  return Response.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function coordinate(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function googleMapsUri(value: unknown) {
  const candidate = textValue(value, 1000);
  try {
    const url = new URL(candidate);
    const googleHost = /^(?:maps|www)\.google\.[a-z.]+$/i.test(url.hostname);
    return url.protocol === 'https:' && googleHost ? candidate : null;
  } catch {
    return null;
  }
}

function normalizeStop(value: unknown, index: number): SavedStop | null {
  if (!value || typeof value !== 'object') return null;
  const stop = value as Record<string, unknown>;
  const lat = coordinate(stop.lat, -90, 90);
  const lng = coordinate(stop.lng, -180, 180);
  const title = textValue(stop.title, 160);
  if (lat == null || lng == null || !title) return null;
  const rawKind = textValue(stop.kind, 12);
  const kind: SavedStop['kind'] = rawKind === 'coffee' || rawKind === 'walk' ? rawKind : 'place';
  const source = stop.source === 'google_places' ? 'google_places' : undefined;

  return {
    id: textValue(stop.id, 180) || `stop-${index + 1}`,
    time: textValue(stop.time, 12),
    title,
    detail: textValue(stop.detail, 300),
    kind,
    placeId: textValue(stop.placeId, 300) || undefined,
    primaryType: textValue(stop.primaryType, 80) || undefined,
    address: textValue(stop.address, 300) || undefined,
    lat,
    lng,
    googleMapsUri: googleMapsUri(stop.googleMapsUri),
    source,
  };
}

function itineraryFromRow(row: ItineraryRow) {
  let stops: SavedStop[] = [];
  try {
    const parsed = JSON.parse(row.stops) as unknown;
    if (Array.isArray(parsed)) stops = parsed.map(normalizeStop).filter((stop): stop is SavedStop => Boolean(stop));
  } catch { /* a malformed stored itinerary is returned without stops */ }

  return {
    id: row.id,
    name: row.name,
    city: row.city,
    locationLabel: row.location_label,
    origin: { lat: row.origin_lat, lng: row.origin_lng },
    stops,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const origin = source.origin && typeof source.origin === 'object' ? source.origin as Record<string, unknown> : {};
  const lat = coordinate(origin.lat, -90, 90);
  const lng = coordinate(origin.lng, -180, 180);
  const city = textValue(source.city, 100);
  const locationLabel = textValue(source.locationLabel, 180);
  const stops = Array.isArray(source.stops)
    ? source.stops.slice(0, 20).map(normalizeStop).filter((stop): stop is SavedStop => Boolean(stop))
    : [];
  if (lat == null || lng == null || !city || !locationLabel || !stops.length) return null;

  const requestedId = textValue(source.id, 36);
  return {
    id: /^[0-9a-f-]{36}$/i.test(requestedId) ? requestedId : null,
    name: textValue(source.name, 120) || `${city} · ${stops.length} ${stops.length === 1 ? 'tappa' : 'tappe'}`,
    city,
    locationLabel,
    origin: { lat, lng },
    stops,
  };
}

export async function GET(request: Request) {
  const user = await getItineraryUser(request);
  if (!user) return unauthorized();
  await ensureSchema();

  const result = await getD1().prepare(`
    SELECT id, name, city, location_label, origin_lat, origin_lng, stops, created_at, updated_at
    FROM saved_itineraries
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 30
  `).bind(user.userId).all<ItineraryRow>();

  return Response.json({ routes: result.results.map(itineraryFromRow) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getItineraryUser(request);
  if (!user) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const itinerary = normalizePayload(payload);
  if (!itinerary) return Response.json({ error: 'INVALID_ITINERARY' }, { status: 400 });
  await ensureSchema();

  const d1 = getD1();
  let id = itinerary.id;
  if (id) {
    const owned = await d1.prepare('SELECT id FROM saved_itineraries WHERE id = ? AND user_id = ?').bind(id, user.userId).first<{ id: string }>();
    if (!owned) return Response.json({ error: 'ITINERARY_NOT_FOUND' }, { status: 404 });
    await d1.prepare(`
      UPDATE saved_itineraries
      SET name = ?, city = ?, location_label = ?, origin_lat = ?, origin_lng = ?, stops = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      itinerary.name,
      itinerary.city,
      itinerary.locationLabel,
      itinerary.origin.lat,
      itinerary.origin.lng,
      JSON.stringify(itinerary.stops),
      id,
      user.userId,
    ).run();
  } else {
    id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO saved_itineraries (id, user_id, name, city, location_label, origin_lat, origin_lng, stops)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      user.userId,
      itinerary.name,
      itinerary.city,
      itinerary.locationLabel,
      itinerary.origin.lat,
      itinerary.origin.lng,
      JSON.stringify(itinerary.stops),
    ).run();
  }

  const row = await d1.prepare(`
    SELECT id, name, city, location_label, origin_lat, origin_lng, stops, created_at, updated_at
    FROM saved_itineraries WHERE id = ? AND user_id = ?
  `).bind(id, user.userId).first<ItineraryRow>();
  return Response.json({ route: row ? itineraryFromRow(row) : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const user = await getItineraryUser(request);
  if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'INVALID_ID' }, { status: 400 });
  await ensureSchema();
  await getD1().prepare('DELETE FROM saved_itineraries WHERE id = ? AND user_id = ?').bind(id, user.userId).run();
  return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
