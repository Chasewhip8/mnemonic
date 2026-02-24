import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { Api } from '../api'
import type { Learning, WorkingStateResponse } from '../domain'
import { DatabaseError, ValidationError } from '../errors'
import { StateRepo } from '../state/repo'
import { LearningsRepo } from './repo'

type MutableInjectResult = {
	prompt: string
	learnings: Array<Learning>
	state?: WorkingStateResponse
}

function formatStatePrompt(state: WorkingStateResponse): string {
	const lines: string[] = []
	lines.push('Working state (live):')
	if (state.state.goal) lines.push(`Goal: ${state.state.goal}`)
	if (state.state.assumptions?.length) {
		lines.push('Assumptions:')
		for (const assumption of state.state.assumptions) lines.push(`- ${assumption}`)
	}
	if (state.state.decisions?.length) {
		lines.push('Decisions:')
		for (const decision of state.state.decisions) {
			lines.push(`- ${decision.text}${decision.status ? ` (${decision.status})` : ''}`)
		}
	}
	if (state.state.open_questions?.length) {
		lines.push('Open questions:')
		for (const openQuestion of state.state.open_questions) lines.push(`- ${openQuestion}`)
	}
	if (state.state.next_actions?.length) {
		lines.push('Next actions:')
		for (const nextAction of state.state.next_actions) lines.push(`- ${nextAction}`)
	}
	if (typeof state.state.confidence === 'number') {
		lines.push(`Confidence: ${state.state.confidence}`)
	}
	return lines.join('\n')
}

function maybeAttachState(
	result: MutableInjectResult,
	includeState: unknown,
	runId: unknown,
	format: string,
): Effect.Effect<void, never, StateRepo> {
	return Effect.gen(function* () {
		if (!(includeState && typeof runId === 'string' && runId.trim())) {
			return
		}

		const stateRepo = yield* StateRepo
		const state = yield* stateRepo.getState(runId.trim())
		if (!state) {
			return
		}

		const statePrompt = formatStatePrompt(state)
		if (result.prompt) {
			result.prompt = `${statePrompt}\n\n${result.prompt}`
		} else if ((format || 'prompt') === 'prompt') {
			result.prompt = statePrompt
		}

		result.state = state
	})
}

export const LearningsApiLive = HttpApiBuilder.group(Api, 'learnings', (handlers) =>
	handlers
		.handle('learn', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo
					.learn(
						payload.scope ?? 'shared',
						payload.trigger,
						payload.learning,
						payload.confidence,
						payload.reason,
						payload.source,
					)
					.pipe(Effect.mapError((cause) => new DatabaseError({ cause })))
			}),
		)
		.handle('inject', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const format = payload.format === 'learnings' ? 'learnings' : 'prompt'
				const injected = yield* repo.inject(
					payload.scopes ?? ['shared'],
					payload.context ?? '',
					payload.limit,
					format,
				)
				const result: MutableInjectResult = {
					prompt: injected.prompt,
					learnings: [...injected.learnings],
				}

				yield* maybeAttachState(result, payload.includeState, payload.runId, format)
				return result
			}),
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
					payload.scopes ?? ['shared'],
					payload.context ?? '',
					payload.limit ?? 5,
					Number.isFinite(threshold) ? threshold : 0,
				)
			}),
		)
		.handle('query', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				return yield* repo.query(payload.scopes ?? ['shared'], payload.text, payload.limit)
			}),
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
			}),
		)
		.handle('deleteLearnings', ({ urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* LearningsRepo
				const filters: {
					confidence_lt?: number
					not_recalled_in_days?: number
					scope?: string
				} = {}

				if (urlParams.confidence_lt != null) {
					filters.confidence_lt = urlParams.confidence_lt
				}

				if (urlParams.not_recalled_in_days != null && urlParams.not_recalled_in_days >= 0) {
					filters.not_recalled_in_days = urlParams.not_recalled_in_days
				}

				if (urlParams.scope?.trim()) {
					filters.scope = urlParams.scope.trim()
				}

				if (Object.keys(filters).length === 0) {
					return yield* new ValidationError({
						message: 'At least one filter required: confidence_lt, not_recalled_in_days, or scope',
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
				return yield* repo.deleteLearning(path.id)
			}),
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
			}),
		),
)
