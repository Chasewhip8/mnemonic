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

const PORT = 8790
const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const DB_PATH = `./data/test-learnings-ext-${RUN_SUFFIX}.db`
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
	confidence?: number
}): Promise<string> {
	const learned = await httpJson(getServer().baseUrl, '/learn', {
		method: 'POST',
		body: {
			trigger: input.trigger,
			learning: input.learning,
			scope: input.scope,
			confidence: input.confidence ?? 0.8,
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

function getLastRecalledValue(row: Record<string, unknown>): unknown {
	return row.lastRecalledAt ?? row.last_recalled_at ?? null
}

function getRecallCountValue(row: Record<string, unknown>): number {
	const raw = row.recallCount ?? row.recall_count ?? 0
	const parsed = Number(raw)
	return Number.isFinite(parsed) ? parsed : 0
}

describe('bulk delete filters', () => {
	it(
		'not_recalled_in_days filter',
		async () => {
			const scope = memoryScope('bulk-not-recalled')
			const recalledTrigger = unique('trigger-recalled')
			const recalledId = await learnMemory({
				scope,
				trigger: recalledTrigger,
				learning: unique('learning-recalled'),
			})
			const staleId = await learnMemory({
				scope,
				trigger: unique('trigger-stale'),
				learning: unique('learning-stale'),
			})

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need memory for ${recalledTrigger} ${recalledTrigger}`,
					scopes: [scope],
					limit: 1,
				},
			})

			expect(injected.status).toBe(200)
			const injectedRows = asArray(asRecord(injected.body).learnings).map((item) => asRecord(item))
			expect(injectedRows.some((row) => row.id === recalledId)).toBe(true)

			await new Promise((resolve) => setTimeout(resolve, 100))

			const deleted = await httpJson(
				getServer().baseUrl,
				`/learnings?not_recalled_in_days=0&scope=${encodeURIComponent(scope)}`,
				{ method: 'DELETE' },
			)

			expect(deleted.status).toBe(200)
			const deletedBody = asRecord(deleted.body)
			const deletedIds = asArray(deletedBody.ids)
			expect(deletedIds).toContain(staleId)
			expect(deletedIds).not.toContain(recalledId)

			const remainingRows = await listScopeLearnings(scope)
			const remainingIds = remainingRows.map((row) => row.id)
			expect(remainingIds).toContain(recalledId)
			expect(remainingIds).not.toContain(staleId)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'scope-only filter',
		async () => {
			const scopeA = memoryScope('bulk-scope-a')
			const scopeB = memoryScope('bulk-scope-b')

			const scopeAId = await learnMemory({
				scope: scopeA,
				trigger: unique('trigger-scope-a'),
				learning: unique('learning-scope-a'),
			})
			const scopeBId = await learnMemory({
				scope: scopeB,
				trigger: unique('trigger-scope-b'),
				learning: unique('learning-scope-b'),
			})

			const deleted = await httpJson(
				getServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scopeA)}`,
				{ method: 'DELETE' },
			)
			expect(deleted.status).toBe(200)

			const scopeARows = await listScopeLearnings(scopeA)
			const scopeBRows = await listScopeLearnings(scopeB)

			expect(scopeARows.some((row) => row.id === scopeAId)).toBe(false)
			expect(scopeBRows.some((row) => row.id === scopeBId)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'combined filters (confidence_lt + scope)',
		async () => {
			const scopeA = memoryScope('bulk-combined-a')
			const scopeB = memoryScope('bulk-combined-b')

			const lowScopeAId = await learnMemory({
				scope: scopeA,
				trigger: unique('trigger-low-a'),
				learning: unique('learning-low-a'),
				confidence: 0.2,
			})
			const highScopeAId = await learnMemory({
				scope: scopeA,
				trigger: unique('trigger-high-a'),
				learning: unique('learning-high-a'),
				confidence: 0.95,
			})
			const lowScopeBId = await learnMemory({
				scope: scopeB,
				trigger: unique('trigger-low-b'),
				learning: unique('learning-low-b'),
				confidence: 0.1,
			})

			const deleted = await httpJson(
				getServer().baseUrl,
				`/learnings?confidence_lt=0.4&scope=${encodeURIComponent(scopeA)}`,
				{ method: 'DELETE' },
			)

			expect(deleted.status).toBe(200)
			const deletedIds = asArray(asRecord(deleted.body).ids)
			expect(deletedIds).toContain(lowScopeAId)
			expect(deletedIds).not.toContain(highScopeAId)
			expect(deletedIds).not.toContain(lowScopeBId)

			const scopeARows = await listScopeLearnings(scopeA)
			const scopeBRows = await listScopeLearnings(scopeB)

			expect(scopeARows.some((row) => row.id === lowScopeAId)).toBe(false)
			expect(scopeARows.some((row) => row.id === highScopeAId)).toBe(true)
			expect(scopeBRows.some((row) => row.id === lowScopeBId)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'no-filter validation',
		async () => {
			const deleted = await httpJson(getServer().baseUrl, '/learnings', {
				method: 'DELETE',
			})

			expect(deleted.status).toBe(400)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('scope priority', () => {
	it(
		'session > shared',
		async () => {
			const sessionScope = memoryScope('priority-session')
			const sharedScope = 'shared'

			const sessionTrigger = unique('trigger-priority-session')
			const sessionId = await learnMemory({
				scope: sessionScope,
				trigger: sessionTrigger,
				learning: unique('learning-priority-session'),
			})
			const sharedId = await learnMemory({
				scope: sharedScope,
				trigger: unique('trigger-priority-shared'),
				learning: unique('learning-priority-shared'),
			})

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need memory for ${sessionTrigger}`,
					scopes: [sessionScope, sharedScope],
					limit: 10,
				},
			})

			expect(injected.status).toBe(200)
			const ids = asArray(asRecord(injected.body).learnings).map((item) => asRecord(item).id)
			expect(ids).toContain(sessionId)
			expect(ids).not.toContain(sharedId)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'agent > shared',
		async () => {
			const agentScope = `agent:${unique('priority-agent')}`
			const sharedScope = 'shared'

			const agentTrigger = unique('trigger-priority-agent')
			const agentId = await learnMemory({
				scope: agentScope,
				trigger: agentTrigger,
				learning: unique('learning-priority-agent'),
			})
			const sharedId = await learnMemory({
				scope: sharedScope,
				trigger: unique('trigger-priority-shared-agent'),
				learning: unique('learning-priority-shared-agent'),
			})

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need memory for ${agentTrigger}`,
					scopes: [agentScope, sharedScope],
					limit: 10,
				},
			})

			expect(injected.status).toBe(200)
			const ids = asArray(asRecord(injected.body).learnings).map((item) => asRecord(item).id)
			expect(ids).toContain(agentId)
			expect(ids).not.toContain(sharedId)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'empty scopes',
		async () => {
			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: unique('context-empty-scopes'),
					scopes: [],
				},
			})

			expect(injected.status).toBe(200)
			expect(asArray(asRecord(injected.body).learnings)).toHaveLength(0)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('recall tracking', () => {
	it(
		'recall tracking updates last_recalled_at and recall_count',
		async () => {
			const scope = memoryScope('recall-tracking')
			const trigger = unique('trigger-recall-tracking')
			const memoryId = await learnMemory({
				scope,
				trigger,
				learning: unique('learning-recall-tracking'),
			})

			const beforeRows = await listScopeLearnings(scope)
			const beforeRow = beforeRows.find((row) => row.id === memoryId)
			expect(beforeRow).toBeDefined()
			if (beforeRow === undefined) {
				throw new Error('Expected learning before inject')
			}

			expect(getLastRecalledValue(beforeRow)).toBeNull()
			expect(getRecallCountValue(beforeRow)).toBe(0)

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need guidance for ${trigger}`,
					scopes: [scope],
					limit: 1,
				},
			})

			expect(injected.status).toBe(200)

			const afterRows = await listScopeLearnings(scope)
			const afterRow = afterRows.find((row) => row.id === memoryId)
			expect(afterRow).toBeDefined()
			if (afterRow === undefined) {
				throw new Error('Expected learning after inject')
			}

			expect(typeof getLastRecalledValue(afterRow)).toBe('string')
			expect(getRecallCountValue(afterRow)).toBeGreaterThanOrEqual(1)
		},
		TEST_TIMEOUT_MS,
	)
})

describe('inject variations', () => {
	it(
		"format: 'learnings'",
		async () => {
			const scope = memoryScope('inject-format-learnings')
			const trigger = unique('trigger-format-learnings')
			const memoryId = await learnMemory({
				scope,
				trigger,
				learning: unique('learning-format-learnings'),
			})

			const injected = await httpJson(getServer().baseUrl, '/inject', {
				method: 'POST',
				body: {
					context: `Need memory for ${trigger}`,
					scopes: [scope],
					format: 'learnings',
					limit: 10,
				},
			})

			expect(injected.status).toBe(200)
			const injectedBody = asRecord(injected.body)
			expect(injectedBody.prompt).toBe('')
			const rows = asArray(injectedBody.learnings).map((item) => asRecord(item))
			expect(rows.some((row) => row.id === memoryId)).toBe(true)
		},
		TEST_TIMEOUT_MS,
	)
})
