import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqlClient } from '@effect/sql';
import { SqliteDrizzle, layer as SqliteDrizzleLayer } from '@effect/sql-drizzle/Sqlite';
import { LibsqlClient } from '@effect/sql-libsql';
import { Effect, Layer } from 'effect';
import { AppConfig } from './config';

export class Database extends Effect.Service<Database>()('Database', {
	effect: Effect.gen(function* () {
		const { dbPath } = yield* AppConfig;
		mkdirSync(dirname(dbPath), { recursive: true });

		const sql = yield* SqlClient.SqlClient;
		const drizzle = yield* SqliteDrizzle;

		yield* sql.unsafe(
			`CREATE TABLE IF NOT EXISTS learnings (
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
			[]
		);

		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_learnings_trigger ON learnings(trigger)',
			[]
		);
		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence)',
			[]
		);
		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_learnings_created_at ON learnings(created_at)',
			[]
		);
		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_learnings_scope ON learnings(scope)',
			[]
		);
		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_learnings_last_recalled_at ON learnings(last_recalled_at)',
			[]
		);

		yield* sql.unsafe(
			`CREATE TABLE IF NOT EXISTS secrets (
				name TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				scope TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)`,
			[]
		);
		yield* sql.unsafe(
			'CREATE INDEX IF NOT EXISTS idx_secrets_scope ON secrets(scope)',
			[]
		);

		yield* sql.unsafe(
			`CREATE TABLE IF NOT EXISTS state_runs (
				run_id TEXT PRIMARY KEY,
				revision INTEGER NOT NULL DEFAULT 0,
				state_json TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active',
				updated_by TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				resolved_at TEXT
			)`,
			[]
		);

		yield* sql.unsafe(
			`CREATE TABLE IF NOT EXISTS state_revisions (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				revision INTEGER NOT NULL,
				state_json TEXT NOT NULL,
				change_summary TEXT,
				updated_by TEXT,
				created_at TEXT NOT NULL
			)`,
			[]
		);

		yield* sql.unsafe(
			`CREATE TABLE IF NOT EXISTS state_events (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				event_type TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				created_by TEXT,
				created_at TEXT NOT NULL
			)`,
			[]
		);

		yield* sql
			.unsafe('ALTER TABLE learnings ADD COLUMN last_recalled_at TEXT', [])
			.pipe(Effect.catchAll(() => Effect.void));
		yield* sql
			.unsafe('ALTER TABLE learnings ADD COLUMN recall_count INTEGER DEFAULT 0', [])
			.pipe(Effect.catchAll(() => Effect.void));

		return {
			sql,
			drizzle,
		};
	}),
}) {}

const LibsqlClientLive = Layer.unwrapEffect(
	Effect.map(AppConfig, ({ dbPath }) =>
		LibsqlClient.layer({
			url: `file:${dbPath}`,
		})
	)
);

const AppConfigLive = AppConfig.Default;

const SqlClientLive = LibsqlClientLive.pipe(Layer.provide(AppConfigLive));

const SqliteDrizzleLive = SqliteDrizzleLayer.pipe(
	Layer.provide(SqlClientLive)
);

const DatabaseOnlyLive = Database.Default.pipe(
	Layer.provide(SqliteDrizzleLive),
	Layer.provide(SqlClientLive),
	Layer.provide(AppConfigLive)
);

export const DatabaseLive = Layer.mergeAll(
	SqlClientLive,
	SqliteDrizzleLive,
	DatabaseOnlyLive
);

export const DatabaseDefault = DatabaseLive;
