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

const NEGATIVE_PORT = 8794
const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const NEGATIVE_DB_PATH = `./data/test-negative-${RUN_SUFFIX}.db`

let server: RunningServer | null = null

function getServer(): RunningServer {
	if (server === null) {
		throw new Error('Negative test server is not running')
	}
	return server
}

beforeAll(async () => {
	server = await startServer({
		port: NEGATIVE_PORT,
		dbPath: NEGATIVE_DB_PATH,
		apiKey: API_KEY,
	})
}, STARTUP_TIMEOUT_MS)

afterAll(async () => {
	if (server !== null) {
		await stopServer(server)
		await removeDbArtifacts(server.dbPath)
	}
}, STARTUP_TIMEOUT_MS)

describe('validation errors', () => {
	it(
		'POST /learn missing trigger returns 400',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/learn', {
				method: 'POST',
				body: { learning: 'some learning' },
			})

			expect(response.status).toBe(400)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'POST /learn missing learning returns 400',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/learn', {
				method: 'POST',
				body: { trigger: 'some trigger' },
			})

			expect(response.status).toBe(400)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'POST /inject empty body returns 400',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {},
			})

			expect(response.status).toBe(400)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('not-found behaviors', () => {
	it(
		'GET /learning/:id/neighbors for nonexistent id',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/learning/nonexistent-id-xyz/neighbors')

			expect(response.status).toBe(200)
			expect(asArray(response.body).length).toBe(0)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'DELETE /learning/:id for nonexistent id is idempotent',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/learning/nonexistent-id-xyz', {
				method: 'DELETE',
			})

			expect(response.status).toBe(200)
			expect(asRecord(response.body)).toEqual({ success: true })
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'GET unknown route returns 404',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/nonexistent-route-xyz')

			expect(response.status).toBe(404)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('auth edge cases', () => {
	it(
		'wrong API key returns 401',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/stats', {
				apiKey: 'wrong-key',
			})

			expect(response.status).toBe(401)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'malformed auth header documents actual status',
		async () => {
			const response = await fetch(`${getServer().baseUrl}/stats`, {
				headers: { Authorization: 'NotBearer token' },
			})

			expect(response.status).toBe(401)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('cleanup endpoint', () => {
	it(
		'POST /cleanup returns cleanup result',
		async () => {
			const response = await httpJson(getServer().baseUrl, '/cleanup', {
				method: 'POST',
			})

			expect(response.status).toBe(200)
			const body = asRecord(response.body)
			expect(typeof body.deleted).toBe('number')
			expect(Array.isArray(body.reasons)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'cleanup removes low-confidence learnings',
		async () => {
			const scope = memoryScope('negative-cleanup')
			const learned = await httpJson(getServer().baseUrl, '/learn', {
				method: 'POST',
				body: {
					trigger: unique('negative-low-confidence-trigger'),
					learning: unique('negative-low-confidence-learning'),
					confidence: 0.1,
					scope,
				},
			})

			expect(learned.status).toBe(200)
			const learningId = asRecord(learned.body).id

			const cleanup = await httpJson(getServer().baseUrl, '/cleanup', {
				method: 'POST',
			})
			expect(cleanup.status).toBe(200)

			const listed = await httpJson(
				getServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			)

			expect(listed.status).toBe(200)
			const ids = asArray(listed.body).map((item) => asRecord(item).id)
			expect(ids).not.toContain(learningId)
		},
		TEST_TIMEOUT_MS,
	)
})
