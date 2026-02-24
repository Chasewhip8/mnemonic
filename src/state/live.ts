import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { Api } from '../api'
import { NotFoundError } from '../errors'
import { StateRepo } from './repo'

export const StateApiLive = HttpApiBuilder.group(Api, 'state', (handlers) =>
	handlers
		.handle('getState', ({ path }) =>
			Effect.gen(function* () {
				const repo = yield* StateRepo
				const result = yield* repo.getState(path.runId)
				if (!result) {
					return yield* new NotFoundError({ message: 'not found' })
				}
				return result
			}),
		)
		.handle('upsertState', ({ path, payload }) =>
			Effect.gen(function* () {
				const repo = yield* StateRepo
				return yield* repo.upsertState(
					path.runId,
					payload,
					payload.updatedBy,
					payload.changeSummary ?? 'state put',
				)
			}),
		)
		.handle('patchState', ({ path, payload }) =>
			Effect.gen(function* () {
				const repo = yield* StateRepo
				return yield* repo.patchState(path.runId, payload, payload.updatedBy)
			}),
		)
		.handle('addStateEvent', ({ path, payload }) =>
			Effect.gen(function* () {
				const repo = yield* StateRepo
				const eventPayload =
					payload.payload !== undefined
						? (payload.payload as Record<string, unknown>)
						: (payload as unknown as Record<string, unknown>)
				return yield* repo.addStateEvent(
					path.runId,
					payload.eventType ?? 'note',
					eventPayload,
					payload.createdBy,
				)
			}),
		)
		.handle('resolveState', ({ path, payload }) =>
			Effect.gen(function* () {
				const repo = yield* StateRepo
				const opts: import('./repo').ResolveStateOptions = {
					persistToLearn: payload.persistToLearn === true,
					...(payload.scope !== undefined ? { scope: payload.scope } : {}),
					...(payload.summaryStyle === 'compact' || payload.summaryStyle === 'full'
						? { summaryStyle: payload.summaryStyle }
						: {}),
					...(payload.updatedBy !== undefined ? { updatedBy: payload.updatedBy } : {}),
				}
				const result = yield* repo.resolveState(path.runId, opts)
				if (!result) {
					return yield* new NotFoundError({ message: 'not found' })
				}
				return result
			}),
		),
)
