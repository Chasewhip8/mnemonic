import { SqliteDrizzle } from '@effect/sql-drizzle/Sqlite';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { WorkingStateResponse } from '../domain';
import { LearningsRepo } from '../learnings/repo';
import * as schema from '../schema';

export interface ResolveStateOptions {
	persistToLearn?: boolean;
	scope?: string;
	summaryStyle?: string;
	updatedBy?: string;
}

function normalizeWorkingStatePayload(payload: any) {
	const asStringArray = (value: any): string[] | undefined => {
		if (!Array.isArray(value)) return undefined;
		return value
			.map((v: any) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
			.filter(Boolean);
	};

	const decisions = Array.isArray(payload?.decisions)
		? payload.decisions
				.map((d: any) => ({
					id: typeof d?.id === 'string' ? d.id : undefined,
					text: typeof d?.text === 'string' ? d.text.trim() : String(d?.text ?? '').trim(),
					status: typeof d?.status === 'string' ? d.status : undefined,
				}))
				.filter((d: any) => d.text)
		: undefined;

	return {
		goal: typeof payload?.goal === 'string' ? payload.goal.trim() : undefined,
		assumptions: asStringArray(payload?.assumptions),
		decisions,
		open_questions: asStringArray(payload?.open_questions),
		next_actions: asStringArray(payload?.next_actions),
		confidence:
			typeof payload?.confidence === 'number' && Number.isFinite(payload.confidence)
				? payload.confidence
				: undefined,
	};
}

export class StateRepo extends Effect.Service<StateRepo>()('StateRepo', {
	effect: Effect.gen(function* () {
		const drizzle = yield* SqliteDrizzle;
		const learningsRepo = yield* LearningsRepo;

		const getState = (runId: string): Effect.Effect<WorkingStateResponse | null> =>
			Effect.gen(function* () {
				const rows = yield* Effect.promise(() =>
					drizzle
						.select()
						.from(schema.stateRuns)
						.where(eq(schema.stateRuns.runId, runId))
						.limit(1)
				);
				const current = rows[0];
				if (!current) return null;
				return new WorkingStateResponse({
					runId: current.runId,
					revision: current.revision,
					status: current.status,
					state: JSON.parse(current.stateJson || '{}'),
					updatedBy: current.updatedBy ?? undefined,
					createdAt: current.createdAt,
					updatedAt: current.updatedAt,
					resolvedAt: current.resolvedAt ?? undefined,
				});
			});

		const upsertState = (
			runId: string,
			payload: any,
			updatedBy?: string,
			changeSummary: string = 'state upsert',
		): Effect.Effect<WorkingStateResponse> =>
			Effect.gen(function* () {
				const now = new Date().toISOString();
				const normalized = normalizeWorkingStatePayload(payload);
				const existing = yield* getState(runId);
				const nextRevision = (existing?.revision ?? 0) + 1;
				const stateJson = JSON.stringify(normalized);

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
							.where(eq(schema.stateRuns.runId, runId))
					);
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
						} as any)
					);
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
					} as any)
				);

				return (yield* getState(runId)) as WorkingStateResponse;
			});

		const patchState = (
			runId: string,
			patch: any,
			updatedBy?: string,
		): Effect.Effect<WorkingStateResponse> =>
			Effect.gen(function* () {
				const current = (yield* getState(runId)) ?? {
					runId,
					revision: 0,
					status: 'active' as const,
					state: {} as any,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
				const next = {
					...current.state,
					...normalizeWorkingStatePayload({ ...current.state, ...patch }),
				};
				return yield* upsertState(runId, next, updatedBy, 'state patch');
			});

		const addStateEvent = (
			runId: string,
			eventType: string,
			payload: Record<string, unknown>,
			createdBy?: string,
		): Effect.Effect<{ success: true; id: string }> =>
			Effect.gen(function* () {
				const now = new Date().toISOString();
				const id = crypto.randomUUID();
				yield* Effect.promise(() =>
					drizzle.insert(schema.stateEvents).values({
						id,
						runId,
						eventType,
						payloadJson: JSON.stringify(payload ?? {}),
						createdBy,
						createdAt: now,
					} as any)
				);
				return { success: true as const, id };
			});

		const resolveState = (
			runId: string,
			opts: ResolveStateOptions = {},
		): Effect.Effect<WorkingStateResponse | null, never> =>
			Effect.gen(function* () {
				const current = yield* getState(runId);
				if (!current) return null;

				const now = new Date().toISOString();
				yield* Effect.promise(() =>
					drizzle
						.update(schema.stateRuns)
						.set({
							status: 'resolved',
							updatedBy: opts.updatedBy,
							updatedAt: now,
							resolvedAt: now,
						})
						.where(eq(schema.stateRuns.runId, runId))
				);

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
						.join(' | ');

					if (compact) {
						yield* learningsRepo.learn(
							opts.scope || 'shared',
							`run:${runId} resolved`,
							compact,
							typeof current.state.confidence === 'number' ? current.state.confidence : 0.8,
							'Derived from working state resolve',
							`state:${runId}`,
						).pipe(
							Effect.catchAll((error) =>
								Effect.logError('Failed to persist learning on resolve', error)
							)
						);
					}
				}

				return yield* getState(runId);
			});

		return {
			getState,
			upsertState,
			patchState,
			addStateEvent,
			resolveState,
		};
	}),
}) {}
