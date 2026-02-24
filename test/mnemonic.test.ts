import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	API_KEY,
	asArray,
	asRecord,
	httpJson,
	memoryScope,
	type RunningServer,
	removeDbArtifacts,
	STARTUP_TIMEOUT_MS,
	startServer,
	stopServer,
	TEST_TIMEOUT_MS,
	unique,
} from './helpers'

const PRIMARY_PORT = Number(process.env.TEST_MNEMONIC_PORT ?? '8787')
const BYPASS_PORT = Number(process.env.TEST_MNEMONIC_BYPASS_PORT ?? '8788')

const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const PRIMARY_DB_PATH = `./data/test-mnemonic-${RUN_SUFFIX}.db`
const BYPASS_DB_PATH = `./data/test-mnemonic-no-auth-${RUN_SUFFIX}.db`

let primaryServer: RunningServer | null = null

function getPrimaryServer(): RunningServer {
	if (primaryServer === null) {
		throw new Error('Primary test server is not running')
	}
	return primaryServer
}

beforeAll(async () => {
	primaryServer = await startServer({
		port: PRIMARY_PORT,
		dbPath: PRIMARY_DB_PATH,
		apiKey: API_KEY,
	})
}, STARTUP_TIMEOUT_MS)

afterAll(async () => {
	if (primaryServer !== null) {
		await stopServer(primaryServer)
		await removeDbArtifacts(primaryServer.dbPath)
	}
}, STARTUP_TIMEOUT_MS)

describe('learn + inject/query/trace', () => {
	it(
		'learn + inject round-trip',
		async () => {
			const scope = memoryScope('scope-roundtrip')
			const trigger = unique('trigger-roundtrip')
			const learningText = unique('learning-roundtrip')

			const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger,
					learning: learningText,
					confidence: 0.92,
					scope,
					reason: 'integration test',
				},
			})

			expect(learned.status).toBe(200)
			const learnedBody = asRecord(learned.body)
			expect(learnedBody.id).toBeTypeOf('string')

			const injected = await httpJson(getPrimaryServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need guidance for ${trigger}`,
					scopes: [scope],
					limit: 5,
				},
			})

			expect(injected.status).toBe(200)
			const injectedBody = asRecord(injected.body)
			expect(injectedBody.prompt).toBeTypeOf('string')

			const learnings = asArray(injectedBody.learnings)
			expect(learnings.length).toBeGreaterThan(0)
			const learnedId = learnedBody.id
			expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'learn + query',
		async () => {
			const scope = memoryScope('scope-query')
			const trigger = unique('trigger-query')
			const learningText = unique('learning-query')

			const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: { trigger, learning: learningText, scope, confidence: 0.88 },
			})

			expect(learned.status).toBe(200)
			const learnedId = asRecord(learned.body).id

			const queried = await httpJson(getPrimaryServer().baseUrl, '/query', {
				method: 'POST',
				body: {
					text: `Find memory about ${trigger}`,
					scopes: [scope],
					limit: 5,
				},
			})

			expect(queried.status).toBe(200)
			const queriedBody = asRecord(queried.body)
			const learnings = asArray(queriedBody.learnings)
			expect(learnings.length).toBeGreaterThan(0)
			expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(true)

			const hits = asRecord(queriedBody.hits)
			expect(typeof hits[scope]).toBe('number')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'inject trace',
		async () => {
			const scope = memoryScope('scope-trace')
			const trigger = unique('trigger-trace')

			await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger,
					learning: unique('learning-trace'),
					scope,
					confidence: 0.75,
				},
			})

			const traced = await httpJson(getPrimaryServer().baseUrl, '/inject/trace', {
				method: 'POST',
				body: {
					context: `trace context ${trigger}`,
					scopes: [scope],
					limit: 5,
					threshold: 0,
				},
			})

			expect(traced.status).toBe(200)
			const tracedBody = asRecord(traced.body)
			expect(asArray(tracedBody.candidates).length).toBeGreaterThan(0)
			expect(asArray(tracedBody.injected).length).toBeGreaterThan(0)

			const metadata = asRecord(tracedBody.metadata)
			expect(typeof metadata.total_candidates).toBe('number')
		},
		TEST_TIMEOUT_MS,
	)
})

describe('learning endpoints', () => {
	it(
		'learning CRUD (learn, list, delete by id)',
		async () => {
			const scope = memoryScope('scope-crud')
			const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-crud'),
					learning: unique('learning-crud'),
					scope,
					confidence: 0.67,
				},
			})

			expect(learned.status).toBe(200)
			const learnedId = asRecord(learned.body).id as string

			const listed = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)
			expect(listed.status).toBe(200)
			expect(asArray(listed.body).some((item) => asRecord(item).id === learnedId)).toBe(true)

			const deleted = await httpJson(getPrimaryServer().baseUrl, `/learning/${learnedId}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)
			expect(asRecord(deleted.body).success).toBe(true)

			const listedAfterDelete = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)
			expect(listedAfterDelete.status).toBe(200)
			expect(asArray(listedAfterDelete.body).some((item) => asRecord(item).id === learnedId)).toBe(
				false,
			)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'bulk delete (confidence_lt filter)',
		async () => {
			const scope = memoryScope('scope-bulk-delete')

			const lowA = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-low-a'),
					learning: unique('learning-low-a'),
					scope,
					confidence: 0.2,
				},
			})
			const lowB = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-low-b'),
					learning: unique('learning-low-b'),
					scope,
					confidence: 0.3,
				},
			})
			const high = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-high'),
					learning: unique('learning-high'),
					scope,
					confidence: 0.95,
				},
			})

			const lowAId = asRecord(lowA.body).id
			const lowBId = asRecord(lowB.body).id
			const highId = asRecord(high.body).id

			const bulkDeleted = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?confidence_lt=0.5&scope=${encodeURIComponent(scope)}`,
				{ method: 'DELETE' },
			)

			expect(bulkDeleted.status).toBe(200)
			const bulkDeletedBody = asRecord(bulkDeleted.body)
			expect((bulkDeletedBody.deleted as number) >= 2).toBe(true)
			const ids = asArray(bulkDeletedBody.ids)
			expect(ids).toContain(lowAId)
			expect(ids).toContain(lowBId)
			expect(ids).not.toContain(highId)

			const remaining = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)
			expect(remaining.status).toBe(200)
			const remainingIds = asArray(remaining.body).map((item) => asRecord(item).id)
			expect(remainingIds).toContain(highId)
			expect(remainingIds).not.toContain(lowAId)
			expect(remainingIds).not.toContain(lowBId)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'learning neighbors',
		async () => {
			const scope = memoryScope('scope-neighbors')
			const base = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: 'deploying bun services',
					learning: unique('keep health checks and graceful shutdown'),
					scope,
					confidence: 0.9,
				},
			})
			const similar = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: 'deploying bun service',
					learning: unique('configure readiness and graceful shutdown'),
					scope,
					confidence: 0.88,
				},
			})

			const baseId = asRecord(base.body).id as string
			const similarId = asRecord(similar.body).id

			const neighbors = await httpJson(
				getPrimaryServer().baseUrl,
				`/learning/${baseId}/neighbors?threshold=0.1&limit=10`,
			)

			expect(neighbors.status).toBe(200)
			const rows = asArray(neighbors.body)
			expect(rows.length).toBeGreaterThan(0)
			expect(rows.some((row) => asRecord(row).id === similarId)).toBe(true)
			const firstRow = rows[0]
			expect(firstRow).toBeDefined()
			if (firstRow !== undefined) {
				expect(typeof asRecord(firstRow).similarity_score).toBe('number')
			}
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'stats',
		async () => {
			const scope = memoryScope('scope-stats')
			await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-stats-a'),
					learning: unique('learning-stats-a'),
					scope,
					confidence: 0.71,
				},
			})
			await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-stats-b'),
					learning: unique('learning-stats-b'),
					scope,
					confidence: 0.72,
				},
			})
			await httpJson(getPrimaryServer().baseUrl, '/secret', {
				method: 'POST',
				body: {
					name: unique('secret-stats'),
					value: unique('value-stats'),
					scope,
				},
			})

			const stats = await httpJson(getPrimaryServer().baseUrl, '/stats')
			expect(stats.status).toBe(200)

			const statsBody = asRecord(stats.body)
			expect((statsBody.totalLearnings as number) >= 2).toBe(true)
			expect((statsBody.totalSecrets as number) >= 1).toBe(true)

			const scopes = asArray(statsBody.scopes).map((item) => asRecord(item))
			const scopeRow = scopes.find((item) => item.scope === scope)
			expect(scopeRow).toBeDefined()
			expect(((scopeRow?.count as number) ?? 0) >= 2).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('secrets', () => {
	it(
		'secrets CRUD (set, get, delete)',
		async () => {
			const scope = memoryScope('scope-secrets')
			const name = unique('secret-name')
			const value = unique('secret-value')

			const setSecret = await httpJson(getPrimaryServer().baseUrl, '/secret', {
				method: 'POST',
				body: { name, value, scope },
			})
			expect(setSecret.status).toBe(200)
			expect(asRecord(setSecret.body).success).toBe(true)

			const getSecret = await httpJson(
				getPrimaryServer().baseUrl,
				`/secret/${encodeURIComponent(name)}?scopes=${encodeURIComponent(scope)}`,
			)
			expect(getSecret.status).toBe(200)
			expect(asRecord(getSecret.body).value).toBe(value)

			const deleteSecret = await httpJson(
				getPrimaryServer().baseUrl,
				`/secret/${encodeURIComponent(name)}?scope=${encodeURIComponent(scope)}`,
				{ method: 'DELETE' },
			)
			expect(deleteSecret.status).toBe(200)
			expect(asRecord(deleteSecret.body).success).toBe(true)

			const listSecrets = await httpJson(
				getPrimaryServer().baseUrl,
				`/secrets?scope=${encodeURIComponent(scope)}`,
			)
			expect(listSecrets.status).toBe(200)
			expect(asArray(listSecrets.body).some((item) => asRecord(item).name === name)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('state lifecycle', () => {
	it(
		'state lifecycle (PUT, GET, PATCH, POST events)',
		async () => {
			const runId = unique('run-lifecycle')

			const putState = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: 'PUT',
					body: {
						goal: unique('goal-lifecycle'),
						assumptions: [unique('assumption')],
						decisions: [{ text: unique('decision') }],
						updatedBy: 'vitest',
						changeSummary: 'initial state',
					},
				},
			)
			expect(putState.status).toBe(200)
			expect(asRecord(putState.body).revision).toBe(1)

			const getState = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
			)
			expect(getState.status).toBe(200)
			expect(asRecord(getState.body).runId).toBe(runId)

			const patchState = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: 'PATCH',
					body: {
						open_questions: [unique('question')],
						next_actions: [unique('next-action')],
						updatedBy: 'vitest',
					},
				},
			)
			expect(patchState.status).toBe(200)
			expect(asRecord(patchState.body).revision).toBe(2)

			const addEvent = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}/events`,
				{
					method: 'POST',
					body: {
						eventType: 'note',
						payload: { text: unique('state-event') },
						createdBy: 'vitest',
					},
				},
			)
			expect(addEvent.status).toBe(200)
			const addEventBody = asRecord(addEvent.body)
			expect(addEventBody.success).toBe(true)
			expect(addEventBody.id).toBeTypeOf('string')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'state resolve with persistToLearn=true',
		async () => {
			const runId = unique('run-resolve')
			const scope = memoryScope('scope-resolve')

			const putState = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: 'PUT',
					body: {
						goal: unique('goal-resolve'),
						decisions: [{ text: unique('decision-resolve') }],
						next_actions: [unique('next-resolve')],
						confidence: 0.81,
						updatedBy: 'vitest',
					},
				},
			)
			expect(putState.status).toBe(200)

			const resolved = await httpJson(
				getPrimaryServer().baseUrl,
				`/state/${encodeURIComponent(runId)}/resolve`,
				{
					method: 'POST',
					body: {
						persistToLearn: true,
						scope,
						updatedBy: 'vitest',
					},
				},
			)
			expect(resolved.status).toBe(200)
			const resolvedBody = asRecord(resolved.body)
			expect(resolvedBody.status).toBe('resolved')
			expect(resolvedBody.resolvedAt).toBeTypeOf('string')

			const learnings = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)
			expect(learnings.status).toBe(200)
			const rows = asArray(learnings.body).map((item) => asRecord(item))
			expect(rows.some((row) => row.trigger === `run:${runId} resolved`)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('health + auth', () => {
	it(
		'health GET /',
		async () => {
			const response = await fetch(`${getPrimaryServer().baseUrl}/`)
			expect(response.status).toBe(200)
			const body = asRecord((await response.json()) as unknown)
			expect(body.status).toBe('ok')
			expect(body.service).toBe('mnemonic')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'auth rejected (no bearer -> 401)',
		async () => {
			const rejected = await httpJson(getPrimaryServer().baseUrl, '/stats', {
				auth: false,
			})
			expect(rejected.status).toBe(401)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'auth bypass (no API_KEY env -> all pass)',
		async () => {
			const bypassServer = await startServer({
				port: BYPASS_PORT,
				dbPath: BYPASS_DB_PATH,
			})

			try {
				const stats = await httpJson(bypassServer.baseUrl, '/stats', {
					auth: false,
				})
				expect(stats.status).toBe(200)

				const setSecret = await httpJson(bypassServer.baseUrl, '/secret', {
					method: 'POST',
					auth: false,
					body: {
						name: unique('bypass-secret'),
						value: unique('bypass-value'),
						scope: memoryScope('bypass-scope'),
					},
				})
				expect(setSecret.status).toBe(200)
				expect(asRecord(setSecret.body).success).toBe(true)
			} finally {
				await stopServer(bypassServer)
				await removeDbArtifacts(bypassServer.dbPath)
			}
		},
		TEST_TIMEOUT_MS,
	)
})
