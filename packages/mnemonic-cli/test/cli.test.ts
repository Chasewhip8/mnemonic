import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PORT = Number(process.env.TEST_MNEMONIC_CLI_PORT ?? '9889')
const API_KEY = 'test-key'
const STARTUP_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 240_000
const REQUIRED_LD_LIBRARY_PATH = '/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib'
const SERVER_ROOT = '/home/chase/mnemonic-scope-improvements'

const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const DB_PATH = `./data/test-cli-${RUN_SUFFIX}.db`
const BASE_URL = `http://127.0.0.1:${PORT}`

let uniqueCounter = 0

function unique(prefix: string): string {
	uniqueCounter += 1
	return `${prefix}-${RUN_SUFFIX}-${uniqueCounter}`
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

async function readStream(stream: NodeJS.ReadableStream | null): Promise<string> {
	if (!stream) return ''
	const chunks: Buffer[] = []
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	}
	return Buffer.concat(chunks).toString('utf8')
}

async function runCli(
	...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = spawn('bun', ['run', `${SERVER_ROOT}/packages/mnemonic-cli/src/main.ts`, ...args], {
		cwd: SERVER_ROOT,
		env: {
			...process.env,
			LD_LIBRARY_PATH: mergedLdLibraryPath(process.env.LD_LIBRARY_PATH),
		},
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		readStream(proc.stdout),
		readStream(proc.stderr),
		new Promise<number>((resolve) => proc.on('close', resolve)),
	])
	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 1 }
}

function cliArgs(...extra: string[]): string[] {
	return ['--url', BASE_URL, '--api-key', API_KEY, ...extra]
}

describe('CLI help and health', () => {
	it(
		'--help exits 0 and shows all major subcommands',
		async () => {
			const result = await runCli('--help')
			expect(result.exitCode).toBe(0)
			const output = `${result.stdout}\n${result.stderr}`
			for (const command of [
				'learn',
				'recall',
				'query',
				'list',
				'forget',
				'prune',
				'neighbors',
				'stats',
				'health',
				'cleanup',
				'rescope',
			]) {
				expect(output).toContain(command)
			}
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'health works without auth',
		async () => {
			const result = await runCli('--url', BASE_URL, 'health')
			expect(result.exitCode).toBe(0)
			expect(result.stdout.toLowerCase()).toMatch(/ok|mnemonic/)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'--json health returns valid JSON',
		async () => {
			const result = await runCli(...cliArgs('--json', 'health'))
			expect(result.exitCode).toBe(0)
			expect(() => JSON.parse(result.stdout)).not.toThrow()
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'invalid url health exits non-zero with connect error and no FiberFailure',
		async () => {
			const result = await runCli('--url', 'http://localhost:99999', 'health')
			expect(result.exitCode).not.toBe(0)
			const output = `${result.stdout}\n${result.stderr}`
			expect(output.toLowerCase()).toContain('connect')
			expect(output).not.toContain('FiberFailure')
		},
		TEST_TIMEOUT_MS,
	)
})

describe('CLI learning commands', () => {
	it(
		'learn stores a learning',
		async () => {
			const result = await runCli(...cliArgs('learn', '--scope', 'shared', 'cli-test-trigger', 'cli-test-learning'))
			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain('<learning id=')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'recall works',
		async () => {
			const result = await runCli(...cliArgs('recall', '--scopes', 'shared', 'cli-test'))
			expect(result.exitCode).toBe(0)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'recall --trace includes trace metadata',
		async () => {
			const result = await runCli(...cliArgs('recall', '--trace', '--scopes', 'shared', 'cli-test'))
			expect(result.exitCode).toBe(0)
			expect(result.stdout.toLowerCase()).toContain('candidates')
			expect(result.stdout.toLowerCase()).toContain('threshold')
			expect(result.stdout.toLowerCase()).toContain('duration')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'query works',
		async () => {
			const result = await runCli(...cliArgs('query', '--scopes', 'shared', 'test'))
			expect(result.exitCode).toBe(0)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'query includes per-result similarity for matching learning',
		async () => {
			const trigger = unique('cli-query-sim-trigger')
			const learning = unique('cli-query-sim-learning')

			const learned = await runCli(...cliArgs('learn', '--scope', 'shared', trigger, learning))
			expect(learned.exitCode).toBe(0)

			const queried = await runCli(...cliArgs('query', '--scopes', 'shared', trigger))
			expect(queried.exitCode).toBe(0)
			expect(queried.stdout).toContain(`<trigger>${trigger}</trigger>`)

			const matcher = new RegExp(
				`<result id="[^"]+" similarity="([^"]+)"[\\s\\S]*?<trigger>${escapeRegExp(trigger)}</trigger>`,
			)
			const match = queried.stdout.match(matcher)
			expect(match).not.toBeNull()

			const value = Number(match?.[1])
			expect(Number.isFinite(value)).toBe(true)
			expect(value).toBeGreaterThan(0)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'recall forwards threshold and filters when very high',
		async () => {
			const trigger = unique('cli-recall-threshold-trigger')
			const learning = unique('cli-recall-threshold-learning')

			const learned = await runCli(...cliArgs('learn', '--scope', 'shared', trigger, learning))
			expect(learned.exitCode).toBe(0)

			const recalled = await runCli(...cliArgs('recall', '--scopes', 'shared', '--threshold', '2', trigger))
			expect(recalled.exitCode).toBe(0)
			expect(recalled.stdout).toContain('<recalled_memories />')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'list works',
		async () => {
			const result = await runCli(...cliArgs('list'))
			expect(result.exitCode).toBe(0)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'stats works and contains a number',
		async () => {
			const result = await runCli(...cliArgs('stats'))
			expect(result.exitCode).toBe(0)
			expect(result.stdout).toMatch(/\d+/)
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'--json stats returns valid JSON',
		async () => {
			const result = await runCli(...cliArgs('--json', 'stats'))
			expect(result.exitCode).toBe(0)
			expect(() => JSON.parse(result.stdout)).not.toThrow()
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'prune --confirm with no filters exits non-zero and explains required filters',
		async () => {
			const result = await runCli(...cliArgs('prune', '--confirm'))
			expect(result.exitCode).not.toBe(0)
			expect(result.stderr).toContain('At least one filter required')
		},
		TEST_TIMEOUT_MS,
	)

	it(
		'rescope changes scope of a learning',
		async () => {
			const learnResult = await runCli(...cliArgs('learn', '--scope', 'shared', unique('rescope-trigger'), unique('rescope-learning')))
			expect(learnResult.exitCode).toBe(0)
			// extract ID from output like: <learning id="xxx" scope="shared" />
			const idMatch = learnResult.stdout.match(/id="([^"]+)"/)
			expect(idMatch).not.toBeNull()
			const id = idMatch?.[1]
			expect(id).toBeDefined()

			const rescopeResult = await runCli(...cliArgs('rescope', id!, 'agent:test'))
			expect(rescopeResult.exitCode).toBe(0)
			expect(rescopeResult.stdout).toContain('agent:test')
		},
		TEST_TIMEOUT_MS,
	)
})

describe('CLI auth behavior', () => {
	it(
		'cleanup without auth exits non-zero',
		async () => {
			const result = await runCli('--url', BASE_URL, 'cleanup')
			expect(result.exitCode).not.toBe(0)
		},
		TEST_TIMEOUT_MS,
	)
})
