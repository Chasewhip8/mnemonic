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

const PORT = 8792
const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const DB_PATH = `./data/test-soft-delete-${RUN_SUFFIX}.db`
let server: RunningServer | null = null

beforeAll(async () => {
	server = await startServer({ port: PORT, dbPath: DB_PATH, apiKey: API_KEY })
}, STARTUP_TIMEOUT_MS)

afterAll(async () => {
	if (server !== null) {
		await stopServer(server)
		await removeDbArtifacts(DB_PATH)
	}
}, STARTUP_TIMEOUT_MS)

function getServer(): RunningServer {
	if (server === null) throw new Error('Server not running')
	return server
}

async function learnMemory(input: {
	scope: string
	trigger: string
	learning: string
}): Promise<string> {
	const learned = await httpJson(getServer().baseUrl, '/learn', {
		method: 'POST',
		body: {
			trigger: input.trigger,
			learning: input.learning,
			scope: input.scope,
		},
	})

	expect(learned.status).toBe(200)
	return asRecord(learned.body).id as string
}

async function listScopeLearnings(scope: string): Promise<Array<Record<string, unknown>>> {
	const listed = await httpJson(
		getServer().baseUrl,
		`/learnings?scope=${encodeURIComponent(scope)}&limit=50`,
	)
	expect(listed.status).toBe(200)
	return asArray(listed.body).map((item) => asRecord(item))
}

describe('soft delete', () => {
	it(
		'single delete sets flag and excludes from listing',
		async () => {
			const scope = memoryScope('soft-delete-single')
			const id = await learnMemory({
				scope,
				trigger: unique('trigger-soft-delete-single'),
				learning: unique('learning-soft-delete-single'),
			})

			const beforeRows = await listScopeLearnings(scope)
			expect(beforeRows.some((row) => row.id === id)).toBe(true)

			const deleted = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)
			expect(asRecord(deleted.body).success).toBe(true)

			const deletedAgain = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deletedAgain.status).toBe(200)
			expect(asRecord(deletedAgain.body).success).toBe(true)

			const afterRows = await listScopeLearnings(scope)
			expect(afterRows.some((row) => row.id === id)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'soft-deleted learning is excluded from inject results',
		async () => {
			const scope = memoryScope('soft-delete-inject')
			const trigger = unique('trigger-soft-delete-inject')
			const id = await learnMemory({
				scope,
				trigger,
				learning: unique('learning-soft-delete-inject'),
			})

			const deleted = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need guidance for ${trigger} ${trigger}`,
					scopes: [scope],
					limit: 10,
					threshold: 0,
				},
			})
			expect(injected.status).toBe(200)

			const rows = asArray(asRecord(injected.body).learnings).map((item) => asRecord(item))
			expect(rows.some((row) => row.id === id)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'soft-deleted learning is excluded from query results',
		async () => {
			const scope = memoryScope('soft-delete-query')
			const trigger = unique('trigger-soft-delete-query')
			const id = await learnMemory({
				scope,
				trigger,
				learning: unique('learning-soft-delete-query'),
			})

			const deleted = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)

			const queried = await httpJson(getServer().baseUrl, '/query', {
				method: 'POST',
				body: {
					text: `Find memory about ${trigger}`,
					scopes: [scope],
					limit: 10,
				},
			})
			expect(queried.status).toBe(200)

			const rows = asArray(asRecord(queried.body).learnings).map((item) => asRecord(item))
			expect(rows.some((row) => row.id === id)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'soft-deleted learning is excluded from stats counts',
		async () => {
			const scope = memoryScope('soft-delete-stats')
			const id = await learnMemory({
				scope,
				trigger: unique('trigger-soft-delete-stats'),
				learning: unique('learning-soft-delete-stats'),
			})

			const beforeStats = await httpJson(getServer().baseUrl, '/stats')
			expect(beforeStats.status).toBe(200)
			const beforeScopes = asArray(asRecord(beforeStats.body).scopes).map((item) => asRecord(item))
			const beforeScopeRow = beforeScopes.find((row) => row.scope === scope)
			expect(beforeScopeRow).toBeDefined()
			expect(((beforeScopeRow?.count as number) ?? 0) >= 1).toBe(true)

			const deleted = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)

			const afterStats = await httpJson(getServer().baseUrl, '/stats')
			expect(afterStats.status).toBe(200)
			const afterScopes = asArray(asRecord(afterStats.body).scopes).map((item) => asRecord(item))
			const afterScopeRow = afterScopes.find((row) => row.scope === scope)
			expect(afterScopeRow).toBeUndefined()
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'soft-deleted learning is excluded from neighbors results',
		async () => {
			const scope = memoryScope('soft-delete-neighbors')
			const baseId = await learnMemory({
				scope,
				trigger: `deploying bun service ${unique('soft-delete-neighbors-base')}`,
				learning: unique('ensure graceful shutdown and health checks'),
			})
			const similarId = await learnMemory({
				scope,
				trigger: `deploying bun services ${unique('soft-delete-neighbors-similar')}`,
				learning: unique('configure readiness checks and graceful shutdown'),
			})

			const neighborsBeforeDelete = await httpJson(
				getServer().baseUrl,
				`/learning/${baseId}/neighbors?threshold=-1&limit=100`,
			)
			expect(neighborsBeforeDelete.status).toBe(200)
			const beforeRows = asArray(neighborsBeforeDelete.body).map((item) => asRecord(item))
			expect(beforeRows.some((row) => row.id === similarId)).toBe(true)

			const deleted = await httpJson(getServer().baseUrl, `/learning/${similarId}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)

			const neighborsAfterDelete = await httpJson(
				getServer().baseUrl,
				`/learning/${baseId}/neighbors?threshold=-1&limit=100`,
			)
			expect(neighborsAfterDelete.status).toBe(200)
			const afterRows = asArray(neighborsAfterDelete.body).map((item) => asRecord(item))
			expect(afterRows.some((row) => row.id === similarId)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'bulk delete soft-deletes scoped learnings and returns ids',
		async () => {
			const scope = memoryScope('soft-delete-bulk')
			const idA = await learnMemory({
				scope,
				trigger: unique('trigger-soft-delete-bulk-a'),
				learning: unique('learning-soft-delete-bulk-a'),
			})
			const idB = await learnMemory({
				scope,
				trigger: unique('trigger-soft-delete-bulk-b'),
				learning: unique('learning-soft-delete-bulk-b'),
			})

			const deleted = await httpJson(
				getServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}`,
				{ method: 'DELETE' },
			)
			expect(deleted.status).toBe(200)

			const deletedBody = asRecord(deleted.body)
			expect(deletedBody.deleted).toBe(2)
			const ids = asArray(deletedBody.ids)
			expect(ids).toContain(idA)
			expect(ids).toContain(idB)

			const remainingRows = await listScopeLearnings(scope)
			expect(remainingRows.some((row) => row.id === idA)).toBe(false)
			expect(remainingRows.some((row) => row.id === idB)).toBe(false)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'rescope on soft-deleted learning returns 404',
		async () => {
			const scope = memoryScope('soft-delete-rescope')
			const id = await learnMemory({
				scope,
				trigger: unique('trigger-soft-delete-rescope'),
				learning: unique('learning-soft-delete-rescope'),
			})

			const deleted = await httpJson(getServer().baseUrl, `/learning/${id}`, {
				method: 'DELETE',
			})
			expect(deleted.status).toBe(200)

			const patched = await httpJson(getServer().baseUrl, `/learning/${id}/scope`, {
				method: 'PATCH',
				body: { scope: 'shared' },
			})

			expect(patched.status).toBe(404)
		},
		TEST_TIMEOUT_MS,
	)
})
