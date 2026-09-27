import path from 'node:path';

import { NodeD1, openNodeD1 } from './node-d1';

/**
 * Stands in for `cloudflare:workers` in the Node build (see vite.config.ts):
 * `env.DB` is a SQLite file instead of a D1 binding. It opens on first use, so
 * building or prerendering never creates a database.
 */
let database: NodeD1 | null = null;

export const env = {
  get DB() {
    database ??= openNodeD1(process.env.CICERO_SQLITE_PATH || path.join('data', 'cicerone.sqlite'));
    return database;
  },
};
