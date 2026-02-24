import { Effect } from 'effect';
import type { Learning, WorkingStateResponse } from '../domain';
import { LearningsRepo } from '../learnings/repo';
import { StateRepo } from '../state/repo';
import { MCP_TOOLS } from './tools';

type JsonRpcRequest = {
	jsonrpc?: unknown;
	id?: unknown;
	method?: unknown;
	params?: unknown;
};

type JsonRpcSuccess = {
	jsonrpc: '2.0';
	id: unknown;
	result: unknown;
};

type JsonRpcError = {
	jsonrpc: '2.0';
	id: unknown;
	error: {
		code: -32600 | -32601 | -32603;
		message: string;
	};
};

export type McpResponse = JsonRpcSuccess | JsonRpcError | null;

type MutableInjectResult = {
	prompt: string;
	learnings: Array<Learning>;
	state?: WorkingStateResponse;
};

const asObject = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asStringArray = (value: unknown, fallback: ReadonlyArray<string>): Array<string> => {
	if (!Array.isArray(value)) return [...fallback];
	const strings = value.filter((item): item is string => typeof item === 'string');
	return strings.length > 0 ? strings : [...fallback];
};

function formatStatePrompt(state: WorkingStateResponse): string {
	const lines: string[] = [];
	lines.push('Working state (live):');
	if (state.state.goal) lines.push(`Goal: ${state.state.goal}`);
	if (state.state.assumptions?.length) {
		lines.push('Assumptions:');
		for (const assumption of state.state.assumptions) lines.push(`- ${assumption}`);
	}
	if (state.state.decisions?.length) {
		lines.push('Decisions:');
		for (const decision of state.state.decisions) {
			lines.push(`- ${decision.text}${decision.status ? ` (${decision.status})` : ''}`);
		}
	}
	if (state.state.open_questions?.length) {
		lines.push('Open questions:');
		for (const openQuestion of state.state.open_questions) lines.push(`- ${openQuestion}`);
	}
	if (state.state.next_actions?.length) {
		lines.push('Next actions:');
		for (const nextAction of state.state.next_actions) lines.push(`- ${nextAction}`);
	}
	if (typeof state.state.confidence === 'number') {
		lines.push(`Confidence: ${state.state.confidence}`);
	}
	return lines.join('\n');
}

const maybeAttachState = (
	result: MutableInjectResult,
	includeState: unknown,
	runId: unknown,
	format: string,
) =>
	Effect.gen(function* () {
		if (!(includeState && typeof runId === 'string' && runId.trim())) {
			return;
		}

		const state = yield* StateRepo;
		const found = yield* state.getState(runId.trim());
		if (!found) {
			return;
		}

		const statePrompt = formatStatePrompt(found);
		if (result.prompt) {
			result.prompt = `${statePrompt}\n\n${result.prompt}`;
		} else if ((format || 'prompt') === 'prompt') {
			result.prompt = statePrompt;
		}

		result.state = found;
	});

const dispatchToolCall = (name: string, args: Record<string, unknown>) =>
	Effect.gen(function* () {
		const learnings = yield* LearningsRepo;
		const state = yield* StateRepo;

		switch (name) {
			case 'learn':
				return yield* learnings.learn(
					asString(args.scope) ?? 'shared',
					asString(args.trigger) ?? '',
					asString(args.learning) ?? '',
					asNumber(args.confidence) ?? 0.8,
					asString(args.reason),
					asString(args.source),
				);

			case 'inject': {
				const result = yield* learnings.inject(
					asStringArray(args.scopes, ['shared']),
					asString(args.context) ?? '',
					asNumber(args.limit) ?? 5,
					'prompt',
				);
				const mutableResult: MutableInjectResult = {
					prompt: result.prompt,
					learnings: [...result.learnings],
				};
				yield* maybeAttachState(
					mutableResult,
					args.includeState,
					args.runId,
					'prompt',
				);
				return mutableResult;
			}

			case 'inject_trace':
				return yield* learnings.injectTrace(
					asStringArray(args.scopes, ['shared']),
					asString(args.context) ?? '',
					asNumber(args.limit) ?? 5,
					asNumber(args.threshold) ?? 0,
				);

			case 'query':
				return yield* learnings.query(
					asStringArray(args.scopes, ['shared']),
					asString(args.query) ?? '',
					asNumber(args.limit) ?? 10,
				);

			case 'forget':
				return yield* learnings.deleteLearning(asString(args.id) ?? '');

			case 'forget_bulk': {
				const confidenceLt = asNumber(args.confidence_lt);
				const notRecalledInDays = asNumber(args.not_recalled_in_days);
				const scope = asString(args.scope);
				const deleteFilters: {
					confidence_lt?: number;
					not_recalled_in_days?: number;
					scope?: string;
				} = {};
				if (confidenceLt !== undefined) {
					deleteFilters.confidence_lt = confidenceLt;
				}
				if (notRecalledInDays !== undefined) {
					deleteFilters.not_recalled_in_days = notRecalledInDays;
				}
				if (scope !== undefined) {
					deleteFilters.scope = scope;
				}
				return yield* learnings.deleteLearnings(deleteFilters);
			}

			case 'learning_neighbors':
				return yield* learnings.getLearningNeighbors(
					asString(args.id) ?? '',
					asNumber(args.threshold) ?? 0.85,
					asNumber(args.limit) ?? 10,
				);

			case 'list': {
				const listScope = asString(args.scope);
				const listLimit = asNumber(args.limit);
				const listFilter: {
					scope?: string;
					limit?: number;
				} = {};
				if (listScope !== undefined) {
					listFilter.scope = listScope;
				}
				if (listLimit !== undefined) {
					listFilter.limit = listLimit;
				}
				return yield* learnings.getLearnings(listFilter);
			}

			case 'stats':
				return yield* learnings.getStats();

			case 'state_get':
				return yield* state.getState(asString(args.runId) ?? '');

			case 'state_put': {
				const runId = asString(args.runId);
				if (!runId) {
					return yield* Effect.fail(new Error('runId is required'));
				}
				const { runId: _runId, ...payload } = args;
				return yield* state.upsertState(
					runId,
					payload,
					asString(payload.updatedBy),
					asString(payload.changeSummary),
				);
			}

			case 'state_patch':
				return yield* state.patchState(
					asString(args.runId) ?? '',
					asObject(args.patch),
					asString(args.updatedBy),
				);

			case 'state_resolve': {
				const resolveScope = asString(args.scope);
				const updatedBy = asString(args.updatedBy);
				const resolveOptions: {
					persistToLearn?: boolean;
					scope?: string;
					summaryStyle?: string;
					updatedBy?: string;
				} = {
					persistToLearn: args.persistToLearn === true,
				};
				if (resolveScope !== undefined) {
					resolveOptions.scope = resolveScope;
				}
				if (args.summaryStyle === 'compact' || args.summaryStyle === 'full') {
					resolveOptions.summaryStyle = args.summaryStyle;
				}
				if (updatedBy !== undefined) {
					resolveOptions.updatedBy = updatedBy;
				}
				return yield* state.resolveState(asString(args.runId) ?? '', resolveOptions);
			}

			default:
				return yield* Effect.fail(new Error(`Unknown tool: ${name}`));
		}
	});

export const handleMcpRequest = (body: unknown): Effect.Effect<McpResponse, never, LearningsRepo | StateRepo> =>
	Effect.gen(function* () {
		const request = asObject(body) as JsonRpcRequest;

		if (request.jsonrpc !== '2.0') {
			return {
				jsonrpc: '2.0' as const,
				id: request.id,
				error: {
					code: -32600 as const,
					message: 'Invalid Request - must be JSON-RPC 2.0',
				},
			};
		}

		const id = request.id;
		const method = asString(request.method);
		const params = asObject(request.params);

		switch (method) {
			case 'initialize':
				return {
					jsonrpc: '2.0' as const,
					id,
					result: {
						protocolVersion: '2024-11-05',
						capabilities: { tools: {} },
						serverInfo: { name: 'deja', version: '1.0.0' },
					},
				};

			case 'tools/list':
				return {
					jsonrpc: '2.0' as const,
					id,
					result: { tools: MCP_TOOLS },
				};

			case 'tools/call':
				return yield* Effect.gen(function* () {
					const name = asString(params.name);
					if (!name) {
						return yield* Effect.fail(new Error('Tool name is required'));
					}

					const result = yield* dispatchToolCall(name, asObject(params.arguments));
					return {
						jsonrpc: '2.0' as const,
						id,
						result: {
							content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
						},
					};
				}).pipe(
					Effect.catchAll((error) =>
						Effect.succeed({
							jsonrpc: '2.0' as const,
							id,
							error: {
								code: -32603 as const,
								message: error instanceof Error ? error.message : String(error),
							},
						})
					),
				);

			case 'notifications/initialized':
			case 'notifications/cancelled':
				return null;

			default:
				return {
					jsonrpc: '2.0' as const,
					id,
					error: {
						code: -32601 as const,
						message: `Method not found: ${String(method)}`,
					},
				};
		}
	});
