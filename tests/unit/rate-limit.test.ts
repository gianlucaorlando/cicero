import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal D1 stand-in: enough SQL to exercise the upsert-and-count contract. */
function createFakeD1() {
  const rows = new Map<string, { window_start: number; count: number }>();
  const statements: string[] = [];
  let failNext = false;
  const guard = () => {
    if (failNext) throw new Error('D1 unavailable');
  };

  return {
    rows,
    statements,
    setFailNext(value: boolean) {
      failNext = value;
    },
    prepare(sql: string) {
      statements.push(sql);
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first<T>(): Promise<T | null> {
          guard();
          const [bucket, windowStart] = args as [string, number];
          const current = rows.get(bucket);
          const next = current && current.window_start === windowStart
            ? { window_start: windowStart, count: current.count + 1 }
            : { window_start: windowStart, count: 1 };
          rows.set(bucket, next);
          return { count: next.count } as T;
        },
        async run() {
          guard();
          if (sql.startsWith('DELETE')) {
            const [threshold] = args as [number];
            for (const [bucket, row] of rows) if (row.window_start < threshold) rows.delete(bucket);
          }
          return { success: true };
        },
      };
      return statement;
    },
    async batch(prepared: Array<{ run: () => Promise<unknown> }>) {
      guard();
      return Promise.all(prepared.map((item) => item.run()));
    },
  };
}

const db = createFakeD1();
vi.mock('@/db', () => ({ getD1: () => db }));

import { chatRateLimitRules, clientKey, enforceRateLimits } from '@/lib/server/rate-limit';

const rule = (limit: number, windowMs = 60_000) => [{ key: 'ip-1', limit, windowMs, scope: 'client' as const }];

beforeEach(() => {
  db.rows.clear();
  db.statements.length = 0;
  db.setFailNext(false);
  vi.unstubAllEnvs();
});

describe('enforceRateLimits', () => {
  it('allows up to the limit and blocks the request after it', async () => {
    const rules = rule(2);
    expect((await enforceRateLimits(rules, 1000)).allowed).toBe(true);
    expect((await enforceRateLimits(rules, 1000)).allowed).toBe(true);
    const blocked = await enforceRateLimits(rules, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe('client');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('starts a new allowance in the next window', async () => {
    const rules = rule(1, 60_000);
    await enforceRateLimits(rules, 0);
    expect((await enforceRateLimits(rules, 30_000)).allowed).toBe(false);
    expect((await enforceRateLimits(rules, 60_000)).allowed).toBe(true);
  });

  it('counts each client separately but shares the global budget', async () => {
    const forClient = (key: string) => [
      { key, limit: 5, windowMs: 60_000, scope: 'client' as const },
      { key: 'chat', limit: 2, windowMs: 60_000, scope: 'global' as const },
    ];
    expect((await enforceRateLimits(forClient('ip-1'), 0)).allowed).toBe(true);
    expect((await enforceRateLimits(forClient('ip-2'), 0)).allowed).toBe(true);
    // Both clients are still under their own limit, but the shared daily budget is spent.
    const blocked = await enforceRateLimits(forClient('ip-3'), 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe('global');
  });

  it('does not burn the global budget when the client limit already blocked the request', async () => {
    const rules = [
      { key: 'ip-1', limit: 1, windowMs: 60_000, scope: 'client' as const },
      { key: 'chat', limit: 10, windowMs: 60_000, scope: 'global' as const },
    ];
    await enforceRateLimits(rules, 0);
    await enforceRateLimits(rules, 0);
    expect(db.rows.get('global:chat')?.count).toBe(1);
  });

  it('keeps counting in memory when D1 is unreachable, instead of letting everything through', async () => {
    db.setFailNext(true);
    const rules = rule(1);
    expect((await enforceRateLimits(rules, 5000)).allowed).toBe(true);
    expect((await enforceRateLimits(rules, 5000)).allowed).toBe(false);
  });

  it('drops stale rows when a window opens', async () => {
    db.rows.set('client:old', { window_start: 0, count: 9 });
    await enforceRateLimits(rule(5), 48 * 60 * 60 * 1000);
    expect(db.rows.has('client:old')).toBe(false);
  });
});

describe('chatRateLimitRules', () => {
  it('caps a client and the day, with tighter numbers in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const rules = chatRateLimitRules('ip-1')!;
    expect(rules.map((r) => r.scope)).toEqual(['client', 'global']);
    expect(rules[0].limit).toBe(20);
    expect(rules[1].limit).toBe(300);
    expect(rules[1].windowMs).toBe(24 * 60 * 60 * 1000);
  });

  it('honours the environment overrides and lets 0 disable the guard', () => {
    vi.stubEnv('CICERO_RATE_LIMIT', '5');
    vi.stubEnv('CICERO_DAILY_CHAT_BUDGET', '50');
    const rules = chatRateLimitRules('ip-1')!;
    expect(rules[0].limit).toBe(5);
    expect(rules[1].limit).toBe(50);

    vi.stubEnv('CICERO_RATE_LIMIT', '0');
    expect(chatRateLimitRules('ip-1')).toBeNull();
  });
});

describe('clientKey', () => {
  it('prefers the signed-in user, then the Cloudflare client IP', () => {
    const request = new Request('https://example.test', { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    expect(clientKey(request, 'auth0:abc')).toBe('auth0:abc');
    expect(clientKey(request)).toBe('1.2.3.4');
    expect(clientKey(new Request('https://example.test'))).toBe('anonymous');
  });
});
