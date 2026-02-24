import { SqlClient } from '@effect/sql'
import { SqliteDrizzle } from '@effect/sql-drizzle/Sqlite'
import { and, desc, sql as drizzleSql, eq, inArray, type SQL } from 'drizzle-orm'
import { Effect, Layer, Schema } from 'effect'
import { AppConfig } from '../config'
import { DatabaseLive } from '../database'
import { Learning } from '../domain'
import { EmbeddingService } from '../embeddings'
import { DatabaseError } from '../errors'
import * as schema from '../schema'

type InjectFormat = 'prompt' | 'learnings'

type DeleteLearningsFilters = {
	confidence_lt?: number
	not_recalled_in_days?: number
	scope?: string
}

type LearningRow = {
	id: unknown
	trigger: unknown
	learning: unknown
	reason?: unknown
	confidence?: unknown
	source?: unknown
	scope: unknown
	created_at?: unknown
	createdAt?: unknown
	last_recalled_at?: unknown
	lastRecalledAt?: unknown
	recall_count?: unknown
	recallCount?: unknown
	distance?: unknown
}

const EmbeddingJson = Schema.parseJson(Schema.Array(Schema.Number))

function filterScopesByPriority(scopes: ReadonlyArray<string>): string[] {
	const priority = ['session:', 'agent:', 'shared']

	for (const prefix of priority) {
		const matches = scopes.filter((scope) => scope.startsWith(prefix))
		if (matches.length > 0) {
			return matches
		}
	}

	return scopes.includes('shared') ? ['shared'] : []
}

function convertSqlLearningRow(row: LearningRow): Learning {
	const reason = row.reason != null ? String(row.reason) : undefined
	const source = row.source != null ? String(row.source) : undefined
	const lastRecalledAt =
		row.last_recalled_at != null
			? String(row.last_recalled_at)
			: row.lastRecalledAt != null
				? String(row.lastRecalledAt)
				: undefined

	return new Learning({
		id: String(row.id),
		trigger: String(row.trigger),
		learning: String(row.learning),
		...(reason !== undefined ? { reason } : {}),
		confidence: row.confidence != null ? Number(row.confidence) : 0,
		...(source !== undefined ? { source } : {}),
		scope: String(row.scope),
		createdAt: String(row.created_at ?? row.createdAt),
		...(lastRecalledAt !== undefined ? { lastRecalledAt } : {}),
		recallCount:
			row.recall_count != null
				? Number(row.recall_count)
				: row.recallCount != null
					? Number(row.recallCount)
					: 0,
	})
}

export class LearningsRepo extends Effect.Service<LearningsRepo>()('LearningsRepo', {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		const db = yield* SqliteDrizzle
		const embeddings = yield* EmbeddingService

		const learn = (
			scope: string,
			trigger: string,
			learning: string,
			confidence: number = 0.5,
			reason?: string,
			source?: string,
		) =>
			Effect.gen(function* () {
				const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
				const textForEmbedding = `When ${trigger}, ${learning}`
				const embedding = yield* embeddings.embed(textForEmbedding)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie)
				const createdAt = new Date().toISOString()

				yield* sql.unsafe(
					`INSERT INTO learnings (id, trigger, learning, reason, confidence, source, scope, embedding, created_at, recall_count)
					 VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?), ?, ?)`,
					[
						id,
						trigger,
						learning,
						reason ?? null,
						confidence,
						source ?? null,
						scope,
						embeddingJson,
						createdAt,
						0,
					],
				)

				return convertSqlLearningRow({
					id,
					trigger,
					learning,
					reason,
					confidence,
					source,
					scope,
					created_at: createdAt,
					recall_count: 0,
				})
			})

		const inject = (
			scopes: ReadonlyArray<string>,
			context: string,
			limit: number = 5,
			format: InjectFormat = 'prompt',
		) =>
			Effect.gen(function* () {
				const filteredScopes = filterScopesByPriority(scopes)
				if (filteredScopes.length === 0) {
					return { prompt: '', learnings: [] as Array<Learning> }
				}

				const embedding = yield* embeddings.embed(context)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie)
				const placeholders = filteredScopes.map(() => '?').join(',')
				const rows = yield* sql.unsafe<LearningRow>(
					`SELECT *, vector_distance_cos(embedding, vector32(?)) as distance
					 FROM learnings
					 WHERE scope IN (${placeholders})
					 ORDER BY distance ASC
					 LIMIT ?`,
					[embeddingJson, ...filteredScopes, limit],
				)

				const learnings = rows
					.map((row) => ({
						learning: convertSqlLearningRow(row),
						similarity: 1 - Number(row.distance ?? 0),
					}))
					.filter((entry) => Number.isFinite(entry.similarity))
					.map((entry) => entry.learning)

				if (learnings.length > 0) {
					const now = new Date().toISOString()
					yield* Effect.promise(() =>
						db
							.update(schema.learnings)
							.set({
								lastRecalledAt: now,
								recallCount: drizzleSql`COALESCE(${schema.learnings.recallCount}, 0) + 1`,
							})
							.where(
								inArray(
									schema.learnings.id,
									learnings.map((learning) => learning.id),
								),
							),
					)
				}

				if (format === 'prompt') {
					const prompt = learnings
						.map((learning) => `When ${learning.trigger}, ${learning.learning}`)
						.join('\n')
					return { prompt, learnings }
				}

				return { prompt: '', learnings }
			}).pipe(
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* Effect.logError('Inject error', error)
						return { prompt: '', learnings: [] as Array<Learning> }
					}),
				),
			)

		const injectTrace = (
			scopes: ReadonlyArray<string>,
			context: string,
			limit: number = 5,
			threshold: number = 0,
		) => {
			const startTime = Date.now()

			return Effect.gen(function* () {
				const filteredScopes = filterScopesByPriority(scopes)

				if (filteredScopes.length === 0) {
					return {
						input_context: context,
						embedding_generated: [] as Array<number>,
						candidates: [] as Array<{
							id: string
							trigger: string
							learning: string
							similarity_score: number
							passed_threshold: boolean
						}>,
						threshold_applied: threshold,
						injected: [] as Array<Learning>,
						duration_ms: Date.now() - startTime,
						metadata: {
							total_candidates: 0,
							above_threshold: 0,
							below_threshold: 0,
						},
					}
				}

				const embedding = yield* embeddings.embed(context)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie)
				const placeholders = filteredScopes.map(() => '?').join(',')
				const candidateLimit = Math.max(limit * 3, 20)

				const rows = yield* sql.unsafe<LearningRow>(
					`SELECT *, vector_distance_cos(embedding, vector32(?)) as distance
					 FROM learnings
					 WHERE scope IN (${placeholders})
					 ORDER BY distance ASC
					 LIMIT ?`,
					[embeddingJson, ...filteredScopes, candidateLimit],
				)

				const byId = new Map<string, Learning>()
				for (const row of rows) {
					const converted = convertSqlLearningRow(row)
					byId.set(converted.id, converted)
				}

				const candidates = rows.map((row) => {
					const similarity = 1 - Number(row.distance ?? 0)
					return {
						id: String(row.id),
						trigger: String(row.trigger),
						learning: String(row.learning),
						similarity_score: similarity,
						passed_threshold: similarity >= threshold,
					}
				})

				candidates.sort((a, b) => b.similarity_score - a.similarity_score)

				const injected = candidates
					.filter((candidate) => candidate.passed_threshold)
					.slice(0, limit)
					.map((candidate) => byId.get(candidate.id))
					.filter((learning): learning is Learning => learning !== undefined)

				const aboveThreshold = candidates.filter((candidate) => candidate.passed_threshold).length

				return {
					input_context: context,
					embedding_generated: embedding,
					candidates,
					threshold_applied: threshold,
					injected,
					duration_ms: Date.now() - startTime,
					metadata: {
						total_candidates: candidates.length,
						above_threshold: aboveThreshold,
						below_threshold: candidates.length - aboveThreshold,
					},
				}
			}).pipe(
				Effect.catchAll(() =>
					Effect.succeed({
						input_context: context,
						embedding_generated: [] as Array<number>,
						candidates: [] as Array<{
							id: string
							trigger: string
							learning: string
							similarity_score: number
							passed_threshold: boolean
						}>,
						threshold_applied: threshold,
						injected: [] as Array<Learning>,
						duration_ms: Date.now() - startTime,
						metadata: {
							total_candidates: 0,
							above_threshold: 0,
							below_threshold: 0,
						},
					}),
				),
			)
		}

		const query = (scopes: ReadonlyArray<string>, text: string, limit: number = 10) =>
			Effect.gen(function* () {
				const filteredScopes = filterScopesByPriority(scopes)
				if (filteredScopes.length === 0) {
					return {
						learnings: [] as Array<Learning>,
						hits: {} as Record<string, number>,
					}
				}

				const embedding = yield* embeddings.embed(text)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie)
				const placeholders = filteredScopes.map(() => '?').join(',')
				const rows = yield* sql.unsafe<LearningRow>(
					`SELECT *, vector_distance_cos(embedding, vector32(?)) as distance
					 FROM learnings
					 WHERE scope IN (${placeholders})
					 ORDER BY distance ASC
					 LIMIT ?`,
					[embeddingJson, ...filteredScopes, limit],
				)

				const learnings = rows
					.map((row) => ({
						learning: convertSqlLearningRow(row),
						similarity: 1 - Number(row.distance ?? 0),
					}))
					.filter((entry) => Number.isFinite(entry.similarity))
					.map((entry) => entry.learning)

				const hits: Record<string, number> = {}
				for (const learning of learnings) {
					hits[learning.scope] = (hits[learning.scope] ?? 0) + 1
				}

				return { learnings, hits }
			}).pipe(
				Effect.catchAll(() =>
					Effect.succeed({
						learnings: [] as Array<Learning>,
						hits: {} as Record<string, number>,
					}),
				),
			)

		const getLearningNeighbors = (id: string, threshold: number = 0.85, limit: number = 10) =>
			Effect.gen(function* () {
				const row = yield* Effect.promise(() =>
					db
						.select({ id: schema.learnings.id })
						.from(schema.learnings)
						.where(eq(schema.learnings.id, id))
						.limit(1),
				)

				if (row.length === 0) {
					return [] as Array<Learning & { similarity_score: number }>
				}

				const candidateLimit = Math.max(limit * 3, 20)
				const rows = yield* sql.unsafe<LearningRow>(
					`SELECT l2.*, vector_distance_cos(l2.embedding, l1.embedding) as distance
					 FROM learnings l1 JOIN learnings l2 ON l1.id = ? AND l2.id != ?
					 ORDER BY distance ASC
					 LIMIT ?`,
					[id, id, candidateLimit],
				)

				return rows
					.map((queryRow) => {
						const similarity = 1 - Number(queryRow.distance ?? 0)
						return {
							...convertSqlLearningRow(queryRow),
							similarity_score: similarity,
							passed: similarity >= threshold,
						}
					})
					.filter((queryRow) => queryRow.passed)
					.slice(0, limit)
					.map(({ passed: _passed, ...queryRow }) => queryRow)
			})

		const getLearnings = (filter?: { scope?: string; limit?: number }) =>
			Effect.gen(function* () {
				const scopedQuery = filter?.scope
					? db.select().from(schema.learnings).where(eq(schema.learnings.scope, filter.scope))
					: db.select().from(schema.learnings)

				const queryBuilder = filter?.limit ? scopedQuery.limit(filter.limit) : scopedQuery

				const results = yield* Effect.tryPromise({
					try: () => queryBuilder.orderBy(desc(schema.learnings.createdAt)),
					catch: (cause) => new DatabaseError({ cause }),
				})

				return results.map((row) => convertSqlLearningRow(row as unknown as LearningRow))
			}).pipe(
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* Effect.logError('Get learnings error', error)
						return [] as Array<Learning>
					}),
				),
			)

		const deleteLearning = (id: string) =>
			Effect.gen(function* () {
				yield* Effect.tryPromise({
					try: () => db.delete(schema.learnings).where(eq(schema.learnings.id, id)),
					catch: (cause) => new DatabaseError({ cause }),
				})

				return { success: true } as { success: boolean; error?: string }
			}).pipe(
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* Effect.logError('Delete learning error', error)
						return { success: false, error: 'Failed to delete learning' } as {
							success: boolean
							error?: string
						}
					}),
				),
			)

		const deleteLearnings = (filters: DeleteLearningsFilters) =>
			Effect.gen(function* () {
				const conditions: Array<SQL<unknown>> = []

				if (filters.confidence_lt != null) {
					conditions.push(drizzleSql`${schema.learnings.confidence} < ${filters.confidence_lt}`)
				}

				if (filters.not_recalled_in_days != null) {
					if (filters.not_recalled_in_days === 0) {
						conditions.push(drizzleSql`${schema.learnings.lastRecalledAt} IS NULL`)
					} else {
						const cutoff = new Date(
							Date.now() - filters.not_recalled_in_days * 24 * 60 * 60 * 1000,
						).toISOString()
						conditions.push(
							drizzleSql`COALESCE(${schema.learnings.lastRecalledAt}, ${schema.learnings.createdAt}) < ${cutoff}`,
						)
					}
				}

				if (filters.scope != null) {
					conditions.push(eq(schema.learnings.scope, filters.scope))
				}

				if (conditions.length === 0) {
					return { deleted: 0, ids: [] as Array<string> }
				}

				const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)
				const toDelete = yield* Effect.promise(() =>
					db.select({ id: schema.learnings.id }).from(schema.learnings).where(whereClause),
				)

				const ids = toDelete.map((row) => row.id)
				if (ids.length === 0) {
					return { deleted: 0, ids: [] as Array<string> }
				}

				yield* Effect.promise(() => db.delete(schema.learnings).where(whereClause))

				return { deleted: ids.length, ids }
			})

		const getStats = () =>
			Effect.gen(function* () {
				const learningCountResult = yield* Effect.tryPromise({
					try: () => db.select({ count: drizzleSql<number>`count(*)` }).from(schema.learnings),
					catch: (cause) => new DatabaseError({ cause }),
				})

				const secretCountResult = yield* Effect.tryPromise({
					try: () => db.select({ count: drizzleSql<number>`count(*)` }).from(schema.secrets),
					catch: (cause) => new DatabaseError({ cause }),
				})

				const learningByScope = yield* Effect.tryPromise({
					try: () =>
						db
							.select({
								scope: schema.learnings.scope,
								count: drizzleSql<number>`count(*)`,
							})
							.from(schema.learnings)
							.groupBy(schema.learnings.scope),
					catch: (cause) => new DatabaseError({ cause }),
				})

				return {
					totalLearnings: Number(learningCountResult[0]?.count ?? 0),
					totalSecrets: Number(secretCountResult[0]?.count ?? 0),
					scopes: learningByScope.map((row) => ({
						scope: row.scope,
						count: Number(row.count ?? 0),
					})),
				}
			}).pipe(
				Effect.catchAll(() =>
					Effect.succeed({
						totalLearnings: 0,
						totalSecrets: 0,
						scopes: [] as Array<{ scope: string; count: number }>,
					}),
				),
			)

		return {
			learn,
			inject,
			injectTrace,
			query,
			getLearningNeighbors,
			getLearnings,
			deleteLearning,
			deleteLearnings,
			getStats,
		}
	}),
}) {}

export const LearningsRepoLive = LearningsRepo.Default.pipe(
	Layer.provide(EmbeddingService.Default),
	Layer.provide(DatabaseLive),
	Layer.provide(AppConfig.Default),
)
