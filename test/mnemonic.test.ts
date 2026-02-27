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

const PRIMARY_PORT = Number(process.env.TEST_MNEMONIC_PORT ?? '9887')
const BYPASS_PORT = Number(process.env.TEST_MNEMONIC_BYPASS_PORT ?? '9888')

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
					threshold: 0,
				},
			})

			expect(injected.status).toBe(200)
			const injectedBody = asRecord(injected.body)
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
				body: { trigger, learning: learningText, scope },
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
			const similarities = asRecord(queriedBody.similarities)
			expect(typeof similarities[String(learnedId)]).toBe('number')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'inject threshold filters out low-similarity results',
		async () => {
			const scope = memoryScope('scope-threshold')
			const trigger = unique('trigger-threshold')
			const learningText = unique('learning-threshold')

			const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: { trigger, learning: learningText, scope },
			})
			expect(learned.status).toBe(200)

			const injected = await httpJson(getPrimaryServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need guidance for ${trigger}`,
					scopes: [scope],
					limit: 5,
					threshold: 2,
				},
			})

			expect(injected.status).toBe(200)
			const injectedBody = asRecord(injected.body)
			expect(asArray(injectedBody.learnings).length).toBe(0)
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
		'bulk delete (scope filter)',
		async () => {
			const scope = memoryScope('scope-bulk-delete')

			const learnA = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-bulk-a'),
					learning: unique('learning-bulk-a'),
					scope,
				},
			})
			const learnB = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-bulk-b'),
					learning: unique('learning-bulk-b'),
					scope,
				},
			})

			const idA = asRecord(learnA.body).id
			const idB = asRecord(learnB.body).id

			const bulkDeleted = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}`,
				{ method: 'DELETE' },
			)

			expect(bulkDeleted.status).toBe(200)
			const bulkDeletedBody = asRecord(bulkDeleted.body)
			expect((bulkDeletedBody.deleted as number) >= 2).toBe(true)
			const ids = asArray(bulkDeletedBody.ids)
			expect(ids).toContain(idA)
			expect(ids).toContain(idB)

			const remaining = await httpJson(
				getPrimaryServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)
			expect(remaining.status).toBe(200)
			const remainingIds = asArray(remaining.body).map((item) => asRecord(item).id)
			expect(remainingIds).not.toContain(idA)
			expect(remainingIds).not.toContain(idB)
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
				},
			})
			const similar = await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: 'deploying bun service',
					learning: unique('configure readiness and graceful shutdown'),
					scope,
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
				},
			})
			await httpJson(getPrimaryServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('trigger-stats-b'),
					learning: unique('learning-stats-b'),
					scope,
				},
			})
			const stats = await httpJson(getPrimaryServer().baseUrl, '/stats')
			expect(stats.status).toBe(200)

			const statsBody = asRecord(stats.body)
			expect((statsBody.totalLearnings as number) >= 2).toBe(true)

			const scopes = asArray(statsBody.scopes).map((item) => asRecord(item))
			const scopeRow = scopes.find((item) => item.scope === scope)
			expect(scopeRow).toBeDefined()
			expect(((scopeRow?.count as number) ?? 0) >= 2).toBe(true)
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
			} finally {
				await stopServer(bypassServer)
				await removeDbArtifacts(bypassServer.dbPath)
			}
		},
		TEST_TIMEOUT_MS,
	)
})
