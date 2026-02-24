import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DejaClient } from '../src/index.ts'
import { ConfigProvider, Effect, Layer } from 'effect'

const PORT = 8789
const API_KEY = 'test-key'
const STARTUP_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 240_000
const REQUIRED_LD_LIBRARY_PATH = '/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib'
const SERVER_ROOT = '/home/chase/deja'

const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const DB_PATH = `./data/test-client-${RUN_SUFFIX}.db`
const BASE_URL = `http://127.0.0.1:${PORT}`

function mergedLdLibraryPath(current: string | undefined): string {
	if (!current || current.trim() === '') return REQUIRED_LD_LIBRARY_PATH
	const parts = current.split(':')
	if (parts.includes(REQUIRED_LD_LIBRARY_PATH)) return current
	return `${REQUIRED_LD_LIBRARY_PATH}:${current}`
}

async function removeDbArtifacts(dbPath: string): Promise<void> {
	for (const suffix of ['', '-wal', '-shm']) {
		const target = `${SERVER_ROOT}/${dbPath}`
		const full = `${target}${suffix}`
		if (existsSync(full)) {
			await rm(full, { force: true })
		}
	}
}

async function waitForServer(baseUrl: string, timeoutMs = STARTUP_TIMEOUT_MS): Promise<void> {
	const deadline = Date.now() + timeoutMs
	let lastError: unknown
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/`)
			if (response.ok) return
			lastError = new Error(`Health check returned ${response.status}`)
		} catch (error) {
			lastError = error
		}
		await delay(250)
	}
	throw new Error(`Server did not become ready at ${baseUrl}: ${String(lastError)}`)
}

let serverProcess: ChildProcess | null = null

beforeAll(async () => {
	await removeDbArtifacts(DB_PATH)
	serverProcess = spawn('bun', ['run', 'src/index.ts'], {
		cwd: SERVER_ROOT,
		env: {
			...process.env,
			PORT: String(PORT),
			API_KEY,
			DB_PATH,
			LD_LIBRARY_PATH: mergedLdLibraryPath(process.env.LD_LIBRARY_PATH),
		},
		stdio: 'pipe',
	})
	await waitForServer(BASE_URL)
}, STARTUP_TIMEOUT_MS)

afterAll(async () => {
	if (serverProcess && serverProcess.exitCode === null) {
		serverProcess.kill('SIGTERM')
		const exited = await Promise.race([
			once(serverProcess, 'exit').then(() => true),
			delay(8_000).then(() => false),
		])
		if (!exited && serverProcess.exitCode === null) {
			serverProcess.kill('SIGKILL')
			await once(serverProcess, 'exit')
		}
	}
	await removeDbArtifacts(DB_PATH)
})

const testLayer = DejaClient.Default.pipe(
	Layer.provide(
		Layer.setConfigProvider(
			ConfigProvider.fromMap(
				new Map([
					['DEJA_URL', BASE_URL],
					['DEJA_API_KEY', API_KEY],
				]),
			),
		),
	),
)

const run = <A>(eff: Effect.Effect<A, unknown, DejaClient>) =>
	Effect.runPromise(eff.pipe(Effect.provide(testLayer)))

describe('DejaClient smoke test', () => {
	it(
		'health.healthCheck: returns status string',
		async () => {
			const result = await run(
				Effect.gen(function* () {
					const client = yield* DejaClient
					return yield* client.health.healthCheck()
				}),
			)
			expect(typeof (result as { status: string }).status).toBe('string')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'learnings.learn: stores a learning and returns id and trigger',
		async () => {
			const result = await run(
				Effect.gen(function* () {
					const client = yield* DejaClient
					return yield* client.learnings.learn({
						payload: { trigger: 'smoke-test', learning: 'it works' },
					})
				}),
			)
			expect(typeof (result as { id: string }).id).toBe('string')
			expect((result as { trigger: string }).trigger).toBe('smoke-test')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'learnings.getStats: returns totalLearnings',
		async () => {
			const result = await run(
				Effect.gen(function* () {
					const client = yield* DejaClient
					return yield* client.learnings.getStats()
				}),
			)
			expect(typeof (result as { totalLearnings: number }).totalLearnings).toBe('number')
		},
		TEST_TIMEOUT_MS,
	)
})
