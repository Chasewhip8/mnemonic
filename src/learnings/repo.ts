import { and, desc, sql as drizzleSql, eq, inArray, type SQL } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { Database } from '../database'
import {
	insertLearningRaw,
	queryLearningNeighborsRaw,
	queryLearningsByEmbeddingRaw,
} from '../database/queries/learnings'
import * as schema from '../database/schema'
import type { LearningRow } from '../database/types'
import { Learning } from '../domain'
import { EmbeddingService } from '../embeddings'

type DeleteLearningsFilters = {
	not_recalled_in_days?: number
	scope?: string
}

const EmbeddingJson = Schema.parseJson(Schema.Array(Schema.Number))

function convertSqlLearningRow(row: LearningRow): Learning {
	return new Learning({
		id: row.id,
		trigger: row.trigger,
		learning: row.learning,
		...(row.reason != null ? { reason: row.reason } : {}),
		...(row.source != null ? { source: row.source } : {}),
		scope: row.scope,
		createdAt: row.created_at,
		...(row.last_recalled_at != null ? { lastRecalledAt: row.last_recalled_at } : {}),
		recallCount: row.recall_count ?? 0,
	})
}

export class LearningsRepo extends Effect.Service<LearningsRepo>()('LearningsRepo', {
	effect: Effect.gen(function* () {
		const database = yield* Database
		const embeddings = yield* EmbeddingService

		const learn = (
			scope: string,
			trigger: string,
			learning: string,
			reason?: string,
			source?: string,
		) =>
			Effect.gen(function* () {
				const id = crypto.randomUUID()
				const textForEmbedding = `When ${trigger}, ${learning}`
				const embedding = yield* embeddings.embed(textForEmbedding)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie) // encoding Array<number> to JSON never fails
				const createdAt = new Date().toISOString()

				yield* database.withDb({
					context: 'learnings.learn.insert',
					run: (db) =>
						insertLearningRaw(db, {
							id,
							trigger,
							learning,
							reason: reason ?? null,
							source: source ?? null,
							scope,
							embeddingJson,
							createdAt,
						}),
				})

				return convertSqlLearningRow({
					id,
					trigger,
					learning,
					reason: reason ?? null,
					source: source ?? null,
					scope,
					created_at: createdAt,
					last_recalled_at: null,
					recall_count: 0,
				})
			})

		const inject = (
			scopes: ReadonlyArray<string>,
			context: string,
			limit: number = 5,
			threshold: number = 0.3,
		) =>
			Effect.gen(function* () {

				const embedding = yield* embeddings.embed(context)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie) // encoding Array<number> to JSON never fails
				const rows = yield* database.withDb({
					context: 'learnings.inject.search',
				run: (db) => queryLearningsByEmbeddingRaw(db, embeddingJson, [...scopes], limit),
				})

				const learnings = rows
					.map((row) => {
						return {
							learning: convertSqlLearningRow(row),
							similarity: 1 - (row.distance ?? 0),
						}
					})
					.filter((entry) => Number.isFinite(entry.similarity) && entry.similarity >= threshold)
					.map((entry) => entry.learning)

				if (learnings.length > 0) {
					const now = new Date().toISOString()
					yield* database.withDb({
						context: 'learnings.inject.bumpRecall',
						run: (db) =>
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
					})
				}

				return { learnings }
			})

		const injectTrace = (
			scopes: ReadonlyArray<string>,
			context: string,
			limit: number = 5,
			threshold: number = 0,
		) => {
			const startTime = Date.now()

			return Effect.gen(function* () {

				const embedding = yield* embeddings.embed(context)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie) // encoding Array<number> to JSON never fails
				const candidateLimit = Math.max(limit * 3, 20)
				const rows = yield* database.withDb({
					context: 'learnings.injectTrace.search',
					run: (db) =>
					queryLearningsByEmbeddingRaw(db, embeddingJson, [...scopes], candidateLimit),
				})

				const byId = new Map<string, Learning>()
				for (const row of rows) {
					const converted = convertSqlLearningRow(row)
					byId.set(converted.id, converted)
				}

				const candidates = rows.map((row) => {
					const similarity = 1 - (row.distance ?? 0)
					return {
						id: row.id,
						trigger: row.trigger,
						learning: row.learning,
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
			})
		}

		const query = (scopes: ReadonlyArray<string>, text: string, limit: number = 10) =>
			Effect.gen(function* () {

				const embedding = yield* embeddings.embed(text)
				const embeddingJson = yield* Schema.encode(EmbeddingJson)(embedding).pipe(Effect.orDie) // encoding Array<number> to JSON never fails
				const rows = yield* database.withDb({
					context: 'learnings.query.search',
				run: (db) => queryLearningsByEmbeddingRaw(db, embeddingJson, [...scopes], limit),
				})

				const entries = rows
					.map((row) => {
						return {
							learning: convertSqlLearningRow(row),
							similarity: 1 - (row.distance ?? 0),
						}
					})
					.filter((entry) => Number.isFinite(entry.similarity))

				const learnings = entries.map((entry) => entry.learning)
				const similarities: Record<string, number> = {}
				for (const entry of entries) {
					similarities[entry.learning.id] = entry.similarity
				}

				const hits: Record<string, number> = {}
				for (const learning of learnings) {
					hits[learning.scope] = (hits[learning.scope] ?? 0) + 1
				}

				return { learnings, similarities, hits }
			})

		const getLearningNeighbors = (id: string, threshold: number = 0.85, limit: number = 10) =>
			Effect.gen(function* () {
				const row = yield* database.withDb({
					context: 'learnings.getLearningNeighbors.exists',
					run: (db) =>
						db
							.select({ id: schema.learnings.id })
							.from(schema.learnings)
							.where(eq(schema.learnings.id, id))
							.limit(1),
				})

				if (row.length === 0) {
					return []
				}

				const candidateLimit = Math.max(limit * 3, 20)
				const rows = yield* database.withDb({
					context: 'learnings.getLearningNeighbors.search',
					run: (db) => queryLearningNeighborsRaw(db, id, candidateLimit),
				})

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
				const results = yield* database.withDb({
					context: 'learnings.getLearnings',
					run: (db) => {
						const scopedQuery = filter?.scope
							? db.select().from(schema.learnings).where(eq(schema.learnings.scope, filter.scope))
							: db.select().from(schema.learnings)

						const queryBuilder = filter?.limit ? scopedQuery.limit(filter.limit) : scopedQuery
						return queryBuilder.orderBy(desc(schema.learnings.createdAt))
					},
				})

				return results.map((row) =>
					convertSqlLearningRow({
						id: row.id,
						trigger: row.trigger,
						learning: row.learning,
						reason: row.reason,
						source: row.source,
						scope: row.scope,
						created_at: row.createdAt,
						last_recalled_at: row.lastRecalledAt,
						recall_count: row.recallCount,
					}),
				)
			})

		const deleteLearning = (id: string) =>
			database.withDb({
				context: 'learnings.deleteLearning',
				run: (db) => db.delete(schema.learnings).where(eq(schema.learnings.id, id)),
			})

		const deleteLearnings = (filters: DeleteLearningsFilters) =>
			Effect.gen(function* () {
				const conditions: Array<SQL<unknown>> = []

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
					return { deleted: 0, ids: [] }
				}

				const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)
				const toDelete = yield* database.withDb({
					context: 'learnings.deleteLearnings.select',
					run: (db) =>
						db.select({ id: schema.learnings.id }).from(schema.learnings).where(whereClause),
				})

				const ids = toDelete.map((row) => row.id)
				if (ids.length === 0) {
					return { deleted: 0, ids: [] }
				}

				yield* database.withDb({
					context: 'learnings.deleteLearnings.delete',
					run: (db) => db.delete(schema.learnings).where(whereClause),
				})

				return { deleted: ids.length, ids }
			})

		const getStats = () =>
			Effect.gen(function* () {
				const learningCountResult = yield* database.withDb({
					context: 'learnings.getStats.learningCount',
					run: (db) => db.select({ count: drizzleSql<number>`count(*)` }).from(schema.learnings),
				})

				const learningByScope = yield* database.withDb({
					context: 'learnings.getStats.byScope',
					run: (db) =>
						db
							.select({
								scope: schema.learnings.scope,
								count: drizzleSql<number>`count(*)`,
							})
							.from(schema.learnings)
							.groupBy(schema.learnings.scope),
				})

				return {
					totalLearnings: Number(learningCountResult[0]?.count ?? 0),
					scopes: learningByScope.map((row) => ({
						scope: row.scope,
						count: Number(row.count ?? 0),
					})),
				}
			})

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
