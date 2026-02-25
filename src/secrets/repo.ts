import { and, desc, eq, inArray } from 'drizzle-orm'
import { Effect } from 'effect'
import { Database } from '../database'
import { upsertSecretRaw } from '../database/queries/secrets'
import * as schema from '../database/schema'
import { Secret } from '../domain'
import { filterScopesByPriority } from '../scopes'

export class SecretsRepo extends Effect.Service<SecretsRepo>()('SecretsRepo', {
	effect: Effect.gen(function* () {
		const database = yield* Database

		return {
			getSecret: (scopes: string[], name: string) =>
				Effect.gen(function* () {
					const filteredScopes = filterScopesByPriority(scopes)
					if (filteredScopes.length === 0) {
						return null
					}

					const whereClause = and(
						eq(schema.secrets.name, name),
						inArray(schema.secrets.scope, filteredScopes),
					)

					const results = yield* database.withDb({
						context: 'secrets.getSecret',
						run: (db) => db.select().from(schema.secrets).where(whereClause).limit(1),
					})

					return results[0]?.value ?? null
				}),

			setSecret: (scope: string, name: string, value: string) =>
				Effect.gen(function* () {
					const now = new Date().toISOString()
					yield* database.withDb({
						context: 'secrets.setSecret',
						run: (db) => upsertSecretRaw(db, { scope, name, value, now }),
					})
				}),

			deleteSecret: (scope: string, name: string) =>
				database
					.withDb({
						context: 'secrets.deleteSecret',
						run: (db) =>
							db
								.delete(schema.secrets)
								.where(and(eq(schema.secrets.name, name), eq(schema.secrets.scope, scope))),
					})
					.pipe(Effect.asVoid),

			listSecrets: (scope?: string) =>
				Effect.gen(function* () {
					const rows = yield* database.withDb({
						context: 'secrets.listSecrets',
						run: (db) =>
							scope
								? db
										.select()
										.from(schema.secrets)
										.where(eq(schema.secrets.scope, scope))
										.orderBy(desc(schema.secrets.updatedAt))
								: db.select().from(schema.secrets).orderBy(desc(schema.secrets.updatedAt)),
					})

					return rows.map(
						(row) =>
							new Secret({
								name: row.name,
								value: row.value,
								scope: row.scope,
								createdAt: row.createdAt,
								updatedAt: row.updatedAt,
							}),
					)
				}),
		}
	}),
}) {}
