import { getD1 } from '@/db';
import { getAuth0Config, getAuth0User } from '@/lib/auth0-server';
import { createEmptyProfile, normalizeProfile, type Profile } from '@/lib/profile';

type ProfileRow = {
  slow_pace: number;
  avoid_queues: number;
  no_fish: number;
  markets: number;
  learned_cafe: string;
  learned_evening: string;
  learned_museum: string;
  learned_restaurant: string;
};

const CREATE_PROFILE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY NOT NULL,
    slow_pace INTEGER NOT NULL DEFAULT 0,
    avoid_queues INTEGER NOT NULL DEFAULT 0,
    no_fish INTEGER NOT NULL DEFAULT 0,
    markets INTEGER NOT NULL DEFAULT 0,
    learned_cafe TEXT NOT NULL DEFAULT '[]',
    learned_evening TEXT NOT NULL DEFAULT '[]',
    learned_museum TEXT NOT NULL DEFAULT '[]',
    learned_restaurant TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

let schemaReady: Promise<void> | null = null;

async function ensureProfileSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1.batch([
      d1.prepare(CREATE_PROFILE_TABLE_SQL),
      d1.prepare('PRAGMA optimize'),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

function parseStoredValues(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function profileFromRow(row: ProfileRow): Profile {
  return normalizeProfile({
    slowPace: row.slow_pace === 1,
    avoidQueues: row.avoid_queues === 1,
    noFish: row.no_fish === 1,
    markets: row.markets === 1,
    learned: {
      cafe: parseStoredValues(row.learned_cafe),
      evening: parseStoredValues(row.learned_evening),
      museum: parseStoredValues(row.learned_museum),
      restaurant: parseStoredValues(row.learned_restaurant),
    },
  });
}

function unauthorized() {
  return Response.json(
    { error: 'AUTHENTICATION_REQUIRED' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function getProfileUser(request: Request) {
  const auth0User = await getAuth0User(request);
  if (auth0User) return { userId: `auth0:${auth0User.userId}` };

  if (getAuth0Config()) return null;
  const sitesUserId = request.headers.get('oai-authenticated-user-id')?.trim();
  return sitesUserId ? { userId: `sites:${sitesUserId.slice(0, 249)}` } : null;
}

export async function GET(request: Request) {
  const user = await getProfileUser(request);
  if (!user) return unauthorized();

  await ensureProfileSchema();
  const row = await getD1()
    .prepare(`
      SELECT slow_pace, avoid_queues, no_fish, markets,
             learned_cafe, learned_evening, learned_museum, learned_restaurant
      FROM user_profiles
      WHERE user_id = ?
    `)
    .bind(user.userId)
    .first<ProfileRow>();

  return Response.json(
    { profile: row ? profileFromRow(row) : createEmptyProfile(), exists: Boolean(row) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  const user = await getProfileUser(request);
  if (!user) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const profile = normalizeProfile(payload);
  await ensureProfileSchema();
  await getD1()
    .prepare(`
      INSERT INTO user_profiles (
        user_id, slow_pace, avoid_queues, no_fish, markets,
        learned_cafe, learned_evening, learned_museum, learned_restaurant,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        slow_pace = excluded.slow_pace,
        avoid_queues = excluded.avoid_queues,
        no_fish = excluded.no_fish,
        markets = excluded.markets,
        learned_cafe = excluded.learned_cafe,
        learned_evening = excluded.learned_evening,
        learned_museum = excluded.learned_museum,
        learned_restaurant = excluded.learned_restaurant,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      user.userId,
      profile.slowPace ? 1 : 0,
      profile.avoidQueues ? 1 : 0,
      profile.noFish ? 1 : 0,
      profile.markets ? 1 : 0,
      JSON.stringify(profile.learned.cafe),
      JSON.stringify(profile.learned.evening),
      JSON.stringify(profile.learned.museum),
      JSON.stringify(profile.learned.restaurant),
    )
    .run();

  return Response.json(
    { profile, saved: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
