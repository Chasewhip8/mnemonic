import { and, like, sql } from 'drizzle-orm'
import { Cron, Effect, Schedule } from 'effect'
import { Database } from './database'
import * as schema from './database/schema'
import { DatabaseError } from './errors'

export class CleanupService extends Effect.Service<CleanupService>()('CleanupService', {
	scoped: Effect.gen(function* () {
		const database = yield* Database

		const runCleanupRaw = Effect.fn('CleanupService.runCleanup')(function* () {
			let deleted = 0
			const reasons: string[] = []

			// 1. Session learnings older than 7 days
			const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
			const staleSession = yield* database.withDb({
				context: 'cleanup.selectStaleSession',
				run: (db) =>
					db
						.select({ id: schema.learnings.id })
						.from(schema.learnings)
						.where(
							and(
								like(schema.learnings.scope, 'session:%'),
								sql`${schema.learnings.createdAt} < ${weekAgo}`,
							),
						),
			})
			if (staleSession.length > 0) {
				deleted += staleSession.length
				reasons.push(`Deleted ${staleSession.length} old session-scoped learnings (>7 days)`)
				yield* database.withDb({
					context: 'cleanup.deleteStaleSession',
					run: (db) =>
						db
							.delete(schema.learnings)
							.where(
								and(
									like(schema.learnings.scope, 'session:%'),
									sql`${schema.learnings.createdAt} < ${weekAgo}`,
								),
							),
				})
			}

			// 2. Agent learnings older than 30 days
			const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
			const staleAgent = yield* database.withDb({
				context: 'cleanup.selectStaleAgent',
				run: (db) =>
					db
						.select({ id: schema.learnings.id })
						.from(schema.learnings)
						.where(
							and(
								like(schema.learnings.scope, 'agent:%'),
								sql`${schema.learnings.createdAt} < ${monthAgo}`,
							),
						),
			})
			if (staleAgent.length > 0) {
				deleted += staleAgent.length
				reasons.push(`Deleted ${staleAgent.length} old agent-scoped learnings (>30 days)`)
				yield* database.withDb({
					context: 'cleanup.deleteStaleAgent',
					run: (db) =>
						db
							.delete(schema.learnings)
							.where(
								and(
									like(schema.learnings.scope, 'agent:%'),
									sql`${schema.learnings.createdAt} < ${monthAgo}`,
								),
							),
				})
			}

			// 3. Low confidence (< 0.3)
			const lowConfidence = yield* database.withDb({
				context: 'cleanup.selectLowConfidence',
				run: (db) =>
					db
						.select({ id: schema.learnings.id })
						.from(schema.learnings)
						.where(sql`${schema.learnings.confidence} < 0.3`),
			})
			if (lowConfidence.length > 0) {
				deleted += lowConfidence.length
				reasons.push(`Deleted ${lowConfidence.length} low-confidence learnings (<0.3 confidence)`)
				yield* database.withDb({
					context: 'cleanup.deleteLowConfidence',
					run: (db) => db.delete(schema.learnings).where(sql`${schema.learnings.confidence} < 0.3`),
				})
			}

			return { deleted, reasons }
		})

		const runCleanup = () =>
			runCleanupRaw().pipe(Effect.mapError((cause) => new DatabaseError({ cause })))

		// Fork background scheduled cleanup fiber
		yield* Effect.forkDaemon(
			Effect.repeat(
				Effect.zipLeft(runCleanup(), Effect.logInfo('Scheduled cleanup complete')),
				Schedule.cron(Cron.unsafeParse('0 0 * * *')),
			),
		)

		return { runCleanup }
	}),
}) {}

