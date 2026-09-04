import { getD1 } from '@/db';

const ready = new Map<string, Promise<void>>();

/**
 * Runs idempotent DDL once per isolate. Drizzle migrations in `drizzle/` are the
 * source of truth for production; this keeps local previews working without them.
 */
export function ensureSchema(key: string, statements: string[]) {
  let pending = ready.get(key);
  if (!pending) {
    const d1 = getD1();
    pending = d1.batch(statements.map((sql) => d1.prepare(sql)))
      .then(() => undefined)
      .catch((error: unknown) => {
        ready.delete(key);
        throw error;
      });
    ready.set(key, pending);
  }
  return pending;
}
