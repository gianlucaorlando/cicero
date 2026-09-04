import { getD1 } from '@/db';
import { isValidLatLng } from '@/lib/geo';
import { getRequestUser } from '@/lib/server/auth-user';
import { errorResponse, json, readJson, textValue, unauthorized } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/schema';
import { normalizeStops } from '@/lib/server/stops';
import type { SavedRoute } from '@/lib/types';

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

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS saved_itineraries (
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
  )`,
  'CREATE INDEX IF NOT EXISTS idx_saved_itineraries_user_updated_at ON saved_itineraries (user_id, updated_at)',
];

const SELECT_COLUMNS = 'id, name, city, location_label, origin_lat, origin_lng, stops, created_at, updated_at';
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

function routeFromRow(row: ItineraryRow): SavedRoute {
  let stops: unknown = [];
  try {
    stops = JSON.parse(row.stops);
  } catch { /* a malformed stored itinerary is returned without stops */ }

  return {
    id: row.id,
    name: row.name,
    city: row.city,
    locationLabel: row.location_label,
    origin: { lat: row.origin_lat, lng: row.origin_lng },
    stops: normalizeStops(stops),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const city = textValue(source.city, 100);
  const locationLabel = textValue(source.locationLabel, 180);
  const stops = normalizeStops(source.stops);
  if (!isValidLatLng(source.origin) || !city || !locationLabel || !stops.length) return null;

  const requestedId = textValue(source.id, 36);
  return {
    id: UUID_PATTERN.test(requestedId) ? requestedId : null,
    name: textValue(source.name, 120) || `${city} · ${stops.length} ${stops.length === 1 ? 'tappa' : 'tappe'}`,
    city,
    locationLabel,
    origin: source.origin,
    stops,
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  await ensureSchema('saved_itineraries', SCHEMA);

  const result = await getD1()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM saved_itineraries WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30`)
    .bind(user.userId)
    .all<ItineraryRow>();

  return json({ routes: result.results.map(routeFromRow) });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();

  const payload = await readJson(request);
  if (payload === null) return errorResponse('INVALID_JSON', 400);
  const itinerary = normalizePayload(payload);
  if (!itinerary) return errorResponse('INVALID_ITINERARY', 400);
  await ensureSchema('saved_itineraries', SCHEMA);

  const d1 = getD1();
  const stops = JSON.stringify(itinerary.stops);
  let id = itinerary.id;

  if (id) {
    const owned = await d1.prepare('SELECT id FROM saved_itineraries WHERE id = ? AND user_id = ?').bind(id, user.userId).first<{ id: string }>();
    if (!owned) return errorResponse('ITINERARY_NOT_FOUND', 404);
    await d1.prepare(`
      UPDATE saved_itineraries
      SET name = ?, city = ?, location_label = ?, origin_lat = ?, origin_lng = ?, stops = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(itinerary.name, itinerary.city, itinerary.locationLabel, itinerary.origin.lat, itinerary.origin.lng, stops, id, user.userId).run();
  } else {
    id = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO saved_itineraries (id, user_id, name, city, location_label, origin_lat, origin_lng, stops)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, user.userId, itinerary.name, itinerary.city, itinerary.locationLabel, itinerary.origin.lat, itinerary.origin.lng, stops).run();
  }

  const row = await d1
    .prepare(`SELECT ${SELECT_COLUMNS} FROM saved_itineraries WHERE id = ? AND user_id = ?`)
    .bind(id, user.userId)
    .first<ItineraryRow>();
  return json({ route: row ? routeFromRow(row) : null });
}

export async function DELETE(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!UUID_PATTERN.test(id)) return errorResponse('INVALID_ID', 400);
  await ensureSchema('saved_itineraries', SCHEMA);
  await getD1().prepare('DELETE FROM saved_itineraries WHERE id = ? AND user_id = ?').bind(id, user.userId).run();
  return json({ deleted: true });
}
