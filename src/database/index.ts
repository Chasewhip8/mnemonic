import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SqliteDrizzle, layer as SqliteDrizzleLayer } from '@effect/sql-drizzle/Sqlite'
import { LibsqlClient } from '@effect/sql-libsql'
import { createClient } from '@libsql/client'
import { drizzle as drizzleClient } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { Config, Duration, Effect, Layer, Schedule, Schema } from 'effect'
import { isTagged } from 'effect/Predicate'
import { AppConfig } from '../config'
import { classifySqliteError, DatabaseAvailabilityError, RetryableDatabaseError } from './errors'

export class DatabaseMigrationError extends Schema.TaggedError<DatabaseMigrationError>()(
	'DatabaseMigrationError',
	{ cause: Schema.Unknown },
) {}

const isTaggedRetryable = isTagged(RetryableDatabaseError._tag)

const retryPolicy = Schedule.exponential(Duration.millis(50)).pipe(
	Schedule.jittered,
	Schedule.union(Schedule.spaced(Duration.seconds(1))),
	Schedule.intersect(Schedule.recurs(5)),
	Schedule.whileInput((cause: unknown) => isTaggedRetryable(cause)),
)

export class Database extends Effect.Service<Database>()('Database', {
	effect: Effect.gen(function* () {
		const drizzle = yield* SqliteDrizzle
		const { dbPath } = yield* AppConfig
		const migrationsFolder = yield* Config.string('DB_MIGRATIONS_DIR').pipe(
			Config.withDefault(resolve(dirname(fileURLToPath(import.meta.url)), './migrations')),
		)

		yield* Effect.logInfo('Running database migrations from', migrationsFolder)

		yield* Effect.tryPromise({
			try: async () => {
				const migrationClient = createClient({ url: `file:${dbPath}` })
				try {
					await migrate(drizzleClient(migrationClient), { migrationsFolder })
				} finally {
					migrationClient.close()
				}
			},
			catch: (cause) => DatabaseMigrationError.make({ cause }),
		})

		yield* Effect.logInfo('Database migrations complete')

		const withDb = <Out>({
			context,
			run,
		}: {
			context: string
			run: (db: typeof drizzle) => Promise<Out>
		}) =>
			Effect.tryPromise({
				try: () => run(drizzle),
				catch: (cause) => classifySqliteError(cause),
			}).pipe(
				Effect.retry(retryPolicy),
				Effect.catchTag('RetryableDatabaseError', (cause) =>
					Effect.fail(DatabaseAvailabilityError.make({ cause })),
				),
				Effect.withSpan('infra::sqlite::withDb', {
					attributes: { context },
				}),
			)

		const withDbTx = <Out>({
			context,
			run,
		}: {
			context: string
			run: (db: unknown) => Promise<Out>
		}) =>
			Effect.tryPromise({
				try: () => drizzle.transaction((tx) => run(tx)),
				catch: (cause) => classifySqliteError(cause),
			}).pipe(
				Effect.retry(retryPolicy),
				Effect.catchTag('RetryableDatabaseError', (cause) =>
					Effect.fail(DatabaseAvailabilityError.make({ cause })),
				),
				Effect.withSpan('infra::sqlite::withDbTx', {
					attributes: { context },
				}),
			)

		return {
			drizzle,
			withDb,
			withDbTx,
		}
	}),
}) {}

const LibsqlClientLive = Layer.unwrapEffect(
	Effect.map(AppConfig, ({ dbPath }) => {
		mkdirSync(dirname(dbPath), { recursive: true })
		return LibsqlClient.layer({
			url: `file:${dbPath}`,
		})
	}),
)

const AppConfigLive = AppConfig.Default

const SqlClientLive = LibsqlClientLive.pipe(Layer.provide(AppConfigLive))

const SqliteDrizzleLive = SqliteDrizzleLayer.pipe(Layer.provide(SqlClientLive))

const DatabaseOnlyLive = Database.Default.pipe(
	Layer.provide(SqliteDrizzleLive),
	Layer.provide(SqlClientLive),
	Layer.provide(AppConfigLive),
)

export const DatabaseLive = Layer.mergeAll(SqlClientLive, SqliteDrizzleLive, DatabaseOnlyLive)

export const DatabaseDefault = DatabaseLive
