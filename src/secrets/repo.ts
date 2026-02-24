import { SqlClient } from '@effect/sql'
import { SqliteDrizzle } from '@effect/sql-drizzle/Sqlite'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Effect } from 'effect'
import { Secret } from '../domain'
import * as schema from '../schema'

function filterScopesByPriority(scopes: string[]): string[] {
	const priority = ['session:', 'agent:', 'shared']

	for (const prefix of priority) {
		const matches = scopes.filter((scope) => scope.startsWith(prefix))
		if (matches.length > 0) {
			return matches
		}
	}

	return scopes.includes('shared') ? ['shared'] : []
}

export class SecretsRepo extends Effect.Service<SecretsRepo>()('SecretsRepo', {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		const drizzle = yield* SqliteDrizzle

		return {
			getSecret: (scopes: string[], name: string): Effect.Effect<string | null> =>
				Effect.gen(function* () {
					const filteredScopes = filterScopesByPriority(scopes)
					if (filteredScopes.length === 0) {
						return null
					}

					const whereClause = and(
						eq(schema.secrets.name, name),
						inArray(schema.secrets.scope, filteredScopes),
					)

					const results = yield* Effect.tryPromise(() =>
						drizzle.select().from(schema.secrets).where(whereClause).limit(1),
					)

					return results[0]?.value ?? null
				}).pipe(
					Effect.catchAll((error) =>
						Effect.gen(function* () {
							yield* Effect.logError('Get secret error', error)
							return null
						}),
					),
				),

			setSecret: (
				scope: string,
				name: string,
				value: string,
			): Effect.Effect<{ success: boolean; error?: string }> =>
				Effect.gen(function* () {
					const now = new Date().toISOString()

					yield* sql.unsafe(
						`INSERT INTO secrets (name, value, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
						ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
						[name, value, scope, now, now],
					)

					return { success: true } as { success: boolean; error?: string }
				}).pipe(
					Effect.catchAll((error) =>
						Effect.gen(function* () {
							yield* Effect.logError('Set secret error', error)
							return { success: false, error: 'Failed to set secret' } as {
								success: boolean
								error?: string
							}
						}),
					),
				),

			deleteSecret: (
				scope: string,
				name: string,
			): Effect.Effect<{ success: boolean; error?: string }> =>
				Effect.gen(function* () {
					yield* Effect.tryPromise(() =>
						drizzle
							.delete(schema.secrets)
							.where(and(eq(schema.secrets.name, name), eq(schema.secrets.scope, scope))),
					)

					return { success: true } as { success: boolean; error?: string }
				}).pipe(
					Effect.catchAll((error) =>
						Effect.gen(function* () {
							yield* Effect.logError('Delete secret error', error)
							return { success: false, error: 'Failed to delete secret' } as {
								success: boolean
								error?: string
							}
						}),
					),
				),

			listSecrets: (scope?: string): Effect.Effect<Secret[]> =>
				Effect.gen(function* () {
					const rows = yield* Effect.tryPromise(() =>
						scope
							? drizzle
									.select()
									.from(schema.secrets)
									.where(eq(schema.secrets.scope, scope))
									.orderBy(desc(schema.secrets.updatedAt))
							: drizzle.select().from(schema.secrets).orderBy(desc(schema.secrets.updatedAt)),
					)

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
				}).pipe(
					Effect.catchAll((error) =>
						Effect.gen(function* () {
							yield* Effect.logError('List secrets error', error)
							return []
						}),
					),
				),
		}
	}),
}) {}
