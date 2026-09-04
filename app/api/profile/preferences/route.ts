import { getD1 } from '@/db';
import { createEmptyProfile, normalizeProfile, type Profile } from '@/lib/profile';
import { getRequestUser } from '@/lib/server/auth-user';
import { errorResponse, json, readJson, unauthorized } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/schema';

type ProfileRow = {
  slow_pace: number;
  avoid_queues: number;
  no_fish: number;
  markets: number;
  learned_cafe: string;
  learned_evening: string;
  learned_museum: string;
  learned_restaurant: string;
  learned_shopping: string;
};

const SCHEMA = [`
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
    learned_shopping TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`];

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
      shopping: parseStoredValues(row.learned_shopping),
    },
  });
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();

  await ensureSchema('user_profiles', SCHEMA);
  const row = await getD1()
    .prepare(`
      SELECT slow_pace, avoid_queues, no_fish, markets,
             learned_cafe, learned_evening, learned_museum, learned_restaurant, learned_shopping
      FROM user_profiles
      WHERE user_id = ?
    `)
    .bind(user.userId)
    .first<ProfileRow>();

  return json({ profile: row ? profileFromRow(row) : createEmptyProfile(), exists: Boolean(row) });
}

export async function PUT(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();

  const payload = await readJson(request);
  if (payload === null) return errorResponse('INVALID_JSON', 400);

  const profile = normalizeProfile(payload);
  await ensureSchema('user_profiles', SCHEMA);
  await getD1()
    .prepare(`
      INSERT INTO user_profiles (
        user_id, slow_pace, avoid_queues, no_fish, markets,
        learned_cafe, learned_evening, learned_museum, learned_restaurant, learned_shopping,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        slow_pace = excluded.slow_pace,
        avoid_queues = excluded.avoid_queues,
        no_fish = excluded.no_fish,
        markets = excluded.markets,
        learned_cafe = excluded.learned_cafe,
        learned_evening = excluded.learned_evening,
        learned_museum = excluded.learned_museum,
        learned_restaurant = excluded.learned_restaurant,
        learned_shopping = excluded.learned_shopping,
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
      JSON.stringify(profile.learned.shopping),
    )
    .run();

  return json({ profile, saved: true });
}
