import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * The slice of Cloudflare D1 the app uses (prepare, bind, first, all, run,
 * batch), over Node's built-in SQLite. It lets the same queries run on a
 * plain Node host such as Render, where D1 does not exist. The SQL is SQLite
 * in both places, so nothing else changes.
 */

function toSqlite(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' || value instanceof Uint8Array) return value;
  // D1 would reject anything else too; a JSON string is the least surprising fallback.
  return JSON.stringify(value);
}

type RunResult = { success: true; results: []; meta: { changes: number; last_row_id: number } };

export class NodeD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new NodeD1Statement(this.db, this.sql, values.map(toSqlite));
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] ?? null : { ...row }) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[]; meta: Record<string, never> }> {
    const rows = this.db.prepare(this.sql).all(...this.values) as Record<string, unknown>[];
    return { success: true, results: rows.map((row) => ({ ...row }) as T), meta: {} };
  }

  async run(): Promise<RunResult> {
    return this.runNow();
  }

  /** Synchronous run, so a batch can hold its transaction open across statements. */
  runNow(): RunResult {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class NodeD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string) {
    return new NodeD1Statement(this.db, sql);
  }

  /** Like D1: every statement or none. */
  async batch(statements: NodeD1Statement[]) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.runNow());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
}

/** Opens (creating it and its folder when missing) the SQLite file that stands in for D1. */
export function openNodeD1(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  // Several requests share one connection: wait for a lock instead of failing, and let readers
  // proceed while a write is in progress.
  db.exec('PRAGMA busy_timeout = 5000');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  return new NodeD1(db);
}
