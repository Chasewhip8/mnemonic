import { mkdirSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

let client: Client | null = null;
let drizzleInstance: ReturnType<typeof drizzle> | null = null;

export function getDb(): Client {
  if (client) return client;
  mkdirSync('./data', { recursive: true });
  client = createClient({
    url: `file:${process.env.DB_PATH || './data/deja.db'}`,
  });
  return client;
}

export function getDrizzle() {
  if (drizzleInstance) return drizzleInstance;
  drizzleInstance = drizzle(getDb(), { schema });
  return drizzleInstance;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  await db.batch([
    // learnings table
    {
      sql: `CREATE TABLE IF NOT EXISTS learnings (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        learning TEXT NOT NULL,
        reason TEXT,
        confidence REAL DEFAULT 1.0,
        source TEXT,
        scope TEXT NOT NULL,
        embedding F32_BLOB(384),
        created_at TEXT NOT NULL,
        last_recalled_at TEXT,
        recall_count INTEGER DEFAULT 0
      )`,
      args: [],
    },
    // learnings indexes
    { sql: 'CREATE INDEX IF NOT EXISTS idx_learnings_trigger ON learnings(trigger)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_learnings_created_at ON learnings(created_at)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_learnings_scope ON learnings(scope)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_learnings_last_recalled_at ON learnings(last_recalled_at)', args: [] },

    // secrets table
    {
      sql: `CREATE TABLE IF NOT EXISTS secrets (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        scope TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      args: [],
    },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_secrets_scope ON secrets(scope)', args: [] },

    // state_runs table
    {
      sql: `CREATE TABLE IF NOT EXISTS state_runs (
        run_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 0,
        state_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      )`,
      args: [],
    },

    // state_revisions table
    {
      sql: `CREATE TABLE IF NOT EXISTS state_revisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        change_summary TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL
      )`,
      args: [],
    },

    // state_events table
    {
      sql: `CREATE TABLE IF NOT EXISTS state_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`,
      args: [],
    },
  ]);

  // ALTER TABLE migrations for backward compatibility (idempotent via try/catch)
  try {
    await db.execute({ sql: 'ALTER TABLE learnings ADD COLUMN last_recalled_at TEXT', args: [] });
  } catch (_) {}
  try {
    await db.execute({ sql: 'ALTER TABLE learnings ADD COLUMN recall_count INTEGER DEFAULT 0', args: [] });
  } catch (_) {}
}