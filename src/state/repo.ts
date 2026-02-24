import { SqliteDrizzle } from '@effect/sql-drizzle/Sqlite'
import { eq } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { WorkingStatePayload, WorkingStateResponse } from '../domain'
import { LearningsRepo } from '../learnings/repo'
import * as schema from '../schema'

export interface ResolveStateOptions {
	persistToLearn?: boolean
	scope?: string
	summaryStyle?: string
	updatedBy?: string
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
	if (typeof value === 'object' && value !== null) {
		return value as UnknownRecord
	}
	return {}
}

function normalizeWorkingStatePayload(payload: unknown) {
	const raw = asRecord(payload)
	const asStringArray = (value: unknown): string[] | undefined => {
		if (!Array.isArray(value)) return undefined
		return value
			.map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
			.filter(Boolean)
	}

	const decisions = Array.isArray(raw.decisions)
		? raw.decisions
				.map((d) => {
					const decision = asRecord(d)
					return {
						id: typeof decision.id === 'string' ? decision.id : undefined,
						text:
							typeof decision.text === 'string'
								? decision.text.trim()
								: String(decision.text ?? '').trim(),
						status: typeof decision.status === 'string' ? decision.status : undefined,
					}
				})
				.filter((d) => d.text)
		: undefined

	return {
		goal: typeof raw.goal === 'string' ? raw.goal.trim() : undefined,
		assumptions: asStringArray(raw.assumptions),
		decisions,
		open_questions: asStringArray(raw.open_questions),
		next_actions: asStringArray(raw.next_actions),
		confidence:
			typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
				? raw.confidence
				: undefined,
	}
}

const WorkingStatePayloadJson = Schema.parseJson(WorkingStatePayload)

export class StateRepo extends Effect.Service<StateRepo>()('StateRepo', {
	effect: Effect.gen(function* () {
		const drizzle = yield* SqliteDrizzle
		const learningsRepo = yield* LearningsRepo

		const getState = (runId: string): Effect.Effect<WorkingStateResponse | null> =>
			Effect.gen(function* () {
				const rows = yield* Effect.promise(() =>
					drizzle.select().from(schema.stateRuns).where(eq(schema.stateRuns.runId, runId)).limit(1),
				)
				const current = rows[0]
				if (!current) return null
				const decodedState = yield* Schema.decodeUnknown(WorkingStatePayloadJson)(
					current.stateJson || '{}',
				).pipe(Effect.orDie)
				return new WorkingStateResponse({
					runId: current.runId,
					revision: current.revision,
					status: current.status,
					state: decodedState,
					updatedBy: current.updatedBy ?? undefined,
					createdAt: current.createdAt,
					updatedAt: current.updatedAt,
					resolvedAt: current.resolvedAt ?? undefined,
				})
			})

		const upsertState = (
			runId: string,
			payload: unknown,
			updatedBy?: string,
			changeSummary: string = 'state upsert',
		): Effect.Effect<WorkingStateResponse> =>
			Effect.gen(function* () {
				const now = new Date().toISOString()
				const normalized = normalizeWorkingStatePayload(payload)
				const normalizedState = new WorkingStatePayload(normalized)
				const existing = yield* getState(runId)
				const nextRevision = (existing?.revision ?? 0) + 1
				const stateJson = yield* Schema.encode(WorkingStatePayloadJson)(normalizedState).pipe(
					Effect.orDie,
				)

				if (existing) {
					yield* Effect.promise(() =>
						drizzle
							.update(schema.stateRuns)
							.set({
								revision: nextRevision,
								stateJson,
								status: existing.status,
								updatedBy,
								updatedAt: now,
							})
							.where(eq(schema.stateRuns.runId, runId)),
					)
				} else {
					yield* Effect.promise(() =>
						drizzle.insert(schema.stateRuns).values({
							runId,
							revision: nextRevision,
							stateJson,
							status: 'active',
							updatedBy,
							createdAt: now,
							updatedAt: now,
							resolvedAt: null,
						} as typeof schema.stateRuns.$inferInsert),
					)
				}

				yield* Effect.promise(() =>
					drizzle.insert(schema.stateRevisions).values({
						id: crypto.randomUUID(),
						runId,
						revision: nextRevision,
						stateJson,
						changeSummary,
						updatedBy,
						createdAt: now,
					} as typeof schema.stateRevisions.$inferInsert),
				)

				return (yield* getState(runId)) as WorkingStateResponse
			})

		const patchState = (
			runId: string,
			patch: unknown,
			updatedBy?: string,
		): Effect.Effect<WorkingStateResponse> =>
			Effect.gen(function* () {
				const current = (yield* getState(runId)) ?? {
					runId,
					revision: 0,
					status: 'active' as const,
					state: new WorkingStatePayload({}),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}
				const next = {
					...(current.state as Record<string, unknown>),
					...normalizeWorkingStatePayload({
						...(current.state as Record<string, unknown>),
						...(patch as Record<string, unknown>),
					}),
				}
				return yield* upsertState(runId, next, updatedBy, 'state patch')
			})

		const addStateEvent = (
			runId: string,
			eventType: string,
			payload: Record<string, unknown>,
			createdBy?: string,
		): Effect.Effect<{ success: true; id: string }> =>
			Effect.gen(function* () {
				const now = new Date().toISOString()
				const id = crypto.randomUUID()
				yield* Effect.promise(() =>
					drizzle.insert(schema.stateEvents).values({
						id,
						runId,
						eventType,
						payloadJson: JSON.stringify(payload ?? {}),
						createdBy,
						createdAt: now,
					} as typeof schema.stateEvents.$inferInsert),
				)
				return { success: true as const, id }
			})

		const resolveState = (
			runId: string,
			opts: ResolveStateOptions = {},
		): Effect.Effect<WorkingStateResponse | null, never> =>
			Effect.gen(function* () {
				const current = yield* getState(runId)
				if (!current) return null

				const now = new Date().toISOString()
				yield* Effect.promise(() =>
					drizzle
						.update(schema.stateRuns)
						.set({
							status: 'resolved',
							updatedBy: opts.updatedBy,
							updatedAt: now,
							resolvedAt: now,
						})
						.where(eq(schema.stateRuns.runId, runId)),
				)

				if (opts.persistToLearn) {
					const compact = [
						current.state.goal ? `Goal: ${current.state.goal}` : '',
						current.state.decisions?.length
							? `Decisions: ${current.state.decisions.map((d) => d.text).join('; ')}`
							: '',
						current.state.next_actions?.length
							? `Next actions: ${current.state.next_actions.join('; ')}`
							: '',
					]
						.filter(Boolean)
						.join(' | ')

					if (compact) {
						yield* learningsRepo
							.learn(
								opts.scope || 'shared',
								`run:${runId} resolved`,
								compact,
								typeof current.state.confidence === 'number' ? current.state.confidence : 0.8,
								'Derived from working state resolve',
								`state:${runId}`,
							)
							.pipe(
								Effect.catchAll((error) =>
									Effect.logError('Failed to persist learning on resolve', error),
								),
							)
					}
				}

				return yield* getState(runId)
			})

		return {
			getState,
			upsertState,
			patchState,
			addStateEvent,
			resolveState,
		}
	}),
}) {}
