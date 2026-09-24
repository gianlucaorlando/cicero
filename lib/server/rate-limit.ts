import { getD1 } from '@/db';
import { ensureSchema } from '@/lib/server/schema';

/**
 * Spend guard for the paid upstreams (Claude and Google Places).
 *
 * Counters live in D1 so every Cloudflare isolate shares them: an in-memory Map
 * would give each isolate its own allowance, which is no cap at all. Fixed
 * windows keep the write to a single atomic upsert per request.
 */

const SCHEMA = [`
  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`];

const CONSUME_SQL = `
  INSERT INTO rate_limits (bucket, window_start, count, updated_at)
  VALUES (?, ?, 1, CURRENT_TIMESTAMP)
  ON CONFLICT(bucket) DO UPDATE SET
    count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
    window_start = excluded.window_start,
    updated_at = CURRENT_TIMESTAMP
  RETURNING count
`;

/** Rows older than this are dead weight: dropped opportunistically when a window opens. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type RateLimitScope = 'client' | 'global';

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  scope?: RateLimitScope;
};

export type RateLimitRule = { key: string; limit: number; windowMs: number; scope: RateLimitScope };

/** Last-resort counter used only when D1 is unreachable, so a broken database never means free spending. */
const memory = new Map<string, { windowStart: number; count: number }>();

function consumeInMemory(bucket: string, windowStart: number) {
  const current = memory.get(bucket);
  const next = current && current.windowStart === windowStart ? { windowStart, count: current.count + 1 } : { windowStart, count: 1 };
  memory.set(bucket, next);
  if (memory.size > 5000) memory.clear();
  return next.count;
}

async function consume(bucket: string, windowStart: number): Promise<number> {
  try {
    await ensureSchema('rate_limits', SCHEMA);
    const d1 = getD1();
    const row = await d1.prepare(CONSUME_SQL).bind(bucket, windowStart).first<{ count: number }>();
    const count = row?.count ?? 1;
    // A fresh window is the cheapest moment to drop yesterday's rows.
    if (count === 1) {
      await d1.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart - STALE_AFTER_MS).run();
    }
    return count;
  } catch (error) {
    console.error('rate limit storage unavailable, counting in memory', error);
    return consumeInMemory(bucket, windowStart);
  }
}

/**
 * Consumes one unit against every rule, in order. The first rule that is already
 * exhausted short-circuits, so a blocked request does not burn the other budgets.
 */
export async function enforceRateLimits(rules: RateLimitRule[], now = Date.now()): Promise<RateLimitResult> {
  for (const rule of rules) {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const count = await consume(`${rule.scope}:${rule.key}`, windowStart);
    if (count > rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000)),
        scope: rule.scope,
      };
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientKey(request: Request, userId?: string | null) {
  return userId || request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'anonymous';
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/**
 * Budgets for the landing lookup of points of interest: three paid Places
 * calls, cached for 20 minutes per ~110 m, so the numbers can be roomier.
 */
export function discoverRateLimitRules(key: string): RateLimitRule[] | null {
  const production = process.env.NODE_ENV === 'production';
  if (positiveInt(process.env.CICERO_RATE_LIMIT, 1) === 0) return null;
  return [
    { key, limit: production ? 30 : 300, windowMs: 10 * 60 * 1000, scope: 'client' },
    { key: 'discover', limit: positiveInt(process.env.CICERO_DAILY_DISCOVER_BUDGET, production ? 600 : 2000), windowMs: 24 * 60 * 60 * 1000, scope: 'global' },
  ];
}

/**
 * Chat budgets, always on. Development gets a roomier allowance so the GUI test
 * suite (about 45 turns in a few minutes) runs, while a runaway loop still stops.
 * `CICERO_RATE_LIMIT=0` disables them entirely.
 */
export function chatRateLimitRules(key: string): RateLimitRule[] | null {
  const production = process.env.NODE_ENV === 'production';
  const perClient = positiveInt(process.env.CICERO_RATE_LIMIT, production ? 20 : 200);
  if (perClient === 0) return null;
  const daily = positiveInt(process.env.CICERO_DAILY_CHAT_BUDGET, production ? 300 : 1000);
  return [
    { key, limit: perClient, windowMs: 10 * 60 * 1000, scope: 'client' },
    { key: 'chat', limit: daily, windowMs: 24 * 60 * 60 * 1000, scope: 'global' },
  ];
}
