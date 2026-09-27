import { describe, expect, it } from 'vitest';

import { openNodeD1 } from '@/db/node-d1';

/** The D1 calls the app makes (rate limits, profiles, saved routes, caches), against the SQLite stand-in. */
describe('SQLite stand-in for D1', () => {
  const fresh = () => openNodeD1(':memory:');

  it('creates tables in a batch and reads rows back with first and all', async () => {
    const db = fresh();
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, name TEXT NOT NULL, rating REAL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_places_name ON places (name)'),
    ]);
    await db.prepare('INSERT INTO places (id, name, rating) VALUES (?, ?, ?)').bind('a', 'Pantheon', 4.8).run();
    await db.prepare('INSERT INTO places (id, name, rating) VALUES (?, ?, ?)').bind('b', 'Trevi', null).run();

    expect(await db.prepare('SELECT name, rating FROM places WHERE id = ?').bind('a').first()).toEqual({ name: 'Pantheon', rating: 4.8 });
    expect(await db.prepare('SELECT name FROM places WHERE id = ?').bind('a').first('name')).toBe('Pantheon');
    expect(await db.prepare('SELECT * FROM places WHERE id = ?').bind('zzz').first()).toBeNull();
    const all = await db.prepare('SELECT id FROM places ORDER BY id').all<{ id: string }>();
    expect(all.results.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('runs the rate-limit upsert with RETURNING, counting per window', async () => {
    const db = fresh();
    await db.prepare('CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    const consume = `
      INSERT INTO rate_limits (bucket, window_start, count, updated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(bucket) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
        window_start = excluded.window_start, updated_at = CURRENT_TIMESTAMP
      RETURNING count`;
    const counts = [];
    for (const window of [1000, 1000, 1000, 2000]) {
      counts.push((await db.prepare(consume).bind('client:x', window).first<{ count: number }>())?.count);
    }
    expect(counts).toEqual([1, 2, 3, 1]);
  });

  it('reports changes, and a failing batch leaves nothing behind', async () => {
    const db = fresh();
    await db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)').run();
    const inserted = await db.prepare('INSERT INTO t (v) VALUES (?)').bind('uno').run();
    expect(inserted.meta).toEqual({ changes: 1, last_row_id: 1 });
    await expect(db.batch([
      db.prepare('INSERT INTO t (v) VALUES (?)').bind('due'),
      db.prepare('INSERT INTO t (v) VALUES (?)').bind(null),
    ])).rejects.toThrow();
    expect((await db.prepare('SELECT COUNT(*) AS n FROM t').first<{ n: number }>())?.n).toBe(1);
  });

  it('binds like D1: booleans as 0/1, undefined as NULL', async () => {
    const db = fresh();
    await db.prepare('CREATE TABLE f (flag INTEGER, missing TEXT)').run();
    await db.prepare('INSERT INTO f (flag, missing) VALUES (?, ?)').bind(true, undefined).run();
    expect(await db.prepare('SELECT flag, missing FROM f').first()).toEqual({ flag: 1, missing: null });
  });
});
