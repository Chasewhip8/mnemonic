import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { Api } from '../api'
import { DatabaseError, ValidationError } from '../errors'
import { LearningsRepo } from './repo'

export const LearningsApiLive = HttpApiBuilder.group(Api, 'learnings', (handlers) =>
	handlers
		.handle('learn', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo
					.learn(
					payload.scope,
						payload.trigger,
						payload.learning,
						payload.reason,
						payload.source,
					)
					.pipe(Effect.mapError((cause) => new DatabaseError({ cause })))
			}),
		)
		.handle('inject', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo.inject(
					payload.scopes,
					payload.context,
					payload.limit,
					payload.threshold,
				)
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('injectTrace', ({ payload, urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const threshold =
					payload.threshold !== undefined
						? payload.threshold
						: urlParams.threshold !== undefined
							? Number.parseFloat(urlParams.threshold)
							: 0

				return yield* repo.injectTrace(
					payload.scopes,
					payload.context,
					payload.limit ?? 5,
					Number.isFinite(threshold) ? threshold : 0,
				)
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('query', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo.query(payload.scopes, payload.text, payload.limit)
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('getLearnings', ({ urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const filter: { scope?: string; limit?: number } = {}
				if (urlParams.scope !== undefined) {
					filter.scope = urlParams.scope
				}
				if (urlParams.limit !== undefined) {
					filter.limit = urlParams.limit
				}

				return yield* repo.getLearnings(filter)
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('deleteLearnings', ({ urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const filters: {
					not_recalled_in_days?: number
					scope?: string
				} = {}

				if (urlParams.not_recalled_in_days != null && urlParams.not_recalled_in_days >= 0) {
					filters.not_recalled_in_days = urlParams.not_recalled_in_days
				}

				if (urlParams.scope?.trim()) {
					filters.scope = urlParams.scope.trim()
				}

				if (Object.keys(filters).length === 0) {
					return yield* new ValidationError({
						message: 'At least one filter required: not_recalled_in_days or scope',
					})
				}

				return yield* repo
					.deleteLearnings(filters)
					.pipe(Effect.mapError((cause) => new DatabaseError({ cause })))
			}),
		)
		.handle('deleteLearning', ({ path }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				yield* repo.deleteLearning(path.id)
				return { success: true as const }
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('getLearningNeighbors', ({ path, urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const threshold =
					urlParams.threshold !== undefined && Number.isFinite(urlParams.threshold)
						? urlParams.threshold
						: 0.85
				const limit =
					urlParams.limit !== undefined && Number.isFinite(urlParams.limit) && urlParams.limit > 0
						? urlParams.limit
						: 10

				return yield* repo
					.getLearningNeighbors(path.id, threshold, limit)
					.pipe(Effect.mapError((cause) => new DatabaseError({ cause })))
			}),
		)
		.handle('getStats', () =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo.getStats()
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		),
)
