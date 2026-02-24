import { type SQLWrapper, sql } from 'drizzle-orm'

type DrizzleRawDb = {
	run: (query: string | SQLWrapper) => PromiseLike<unknown>
}

export function upsertSecretRaw(
	db: DrizzleRawDb,
	params: { scope: string; name: string; value: string; now: string },
): Promise<void> {
	return Promise.resolve(
		db.run(sql`INSERT INTO secrets (name, value, scope, created_at, updated_at) VALUES (${params.name}, ${params.value}, ${params.scope}, ${params.now}, ${params.now})
			ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`),
	).then(() => undefined)
}
