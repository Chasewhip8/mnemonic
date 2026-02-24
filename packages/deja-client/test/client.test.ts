import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import deja from '../src/index.ts'

const PORT = 8789
const API_KEY = 'test-key'
const STARTUP_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = 240_000
const REQUIRED_LD_LIBRARY_PATH = '/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib'
const SERVER_ROOT = '/home/chase/deja'

const RUN_SUFFIX = `${Date.now()}-${process.pid}`
const DB_PATH = `./data/test-client-${RUN_SUFFIX}.db`

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
const BASE_URL = `http://127.0.0.1:${PORT}`

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

const uniqueScope = () => `session:test-${Date.now()}-${Math.random().toString(36).slice(2)}`

describe('deja() backward-compat client — integration', () => {
  it('learn: stores a learning and returns it with expected fields', async () => {
    const scope = uniqueScope()
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    const result = await mem.learn('when tests fail', 'check the logs first', {
      scope,
      confidence: 0.9,
    })

    expect(result).toMatchObject({
      trigger: 'when tests fail',
      learning: 'check the logs first',
      confidence: 0.9,
      scope,
    })
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
    expect(typeof result.createdAt).toBe('string')
  }, TEST_TIMEOUT_MS)

  it('inject: returns prompt and learnings for context', async () => {
    const scope = uniqueScope()
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    await mem.learn('deploy fails on Friday', 'avoid Friday deploys', { scope, confidence: 0.85 })

    const result = await mem.inject('deploying to production', { scopes: [scope], limit: 5 })

    expect(result).toHaveProperty('prompt')
    expect(result).toHaveProperty('learnings')
    expect(typeof result.prompt).toBe('string')
    expect(Array.isArray(result.learnings)).toBe(true)
  }, TEST_TIMEOUT_MS)

  it('query: returns learnings and hits for search text', async () => {
    const scope = uniqueScope()
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    await mem.learn('database migration fails', 'backup first', { scope, confidence: 0.9 })

    const result = await mem.query('database migration', { scopes: [scope], limit: 5 })

    expect(result).toHaveProperty('learnings')
    expect(result).toHaveProperty('hits')
    expect(Array.isArray(result.learnings)).toBe(true)
    expect(typeof result.hits).toBe('object')
  }, TEST_TIMEOUT_MS)

  it('list: returns array of learnings, filterable by scope', async () => {
    const scope = uniqueScope()
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    await mem.learn('config missing', 'check .env file', { scope, confidence: 0.8 })
    await mem.learn('port conflict', 'kill process on port', { scope, confidence: 0.75 })

    const result = await mem.list({ scope, limit: 20 })

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(2)
    for (const item of result) {
      expect(item.scope).toBe(scope)
    }
  }, TEST_TIMEOUT_MS)

  it('forget: deletes a learning by id', async () => {
    const scope = uniqueScope()
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    const learning = await mem.learn('temp learning', 'to be deleted', { scope, confidence: 0.5 })
    const deleteResult = await mem.forget(learning.id)

    expect(deleteResult).toMatchObject({ success: true })
    const remaining = await mem.list({ scope })
    const found = remaining.find((l) => l.id === learning.id)
    expect(found).toBeUndefined()
  }, TEST_TIMEOUT_MS)

  it('stats: returns totalLearnings, totalSecrets, and scopes', async () => {
    const mem = deja(BASE_URL, { apiKey: API_KEY })

    const result = await mem.stats()

    expect(result).toHaveProperty('totalLearnings')
    expect(result).toHaveProperty('totalSecrets')
    expect(result).toHaveProperty('scopes')
    expect(typeof result.totalLearnings).toBe('number')
    expect(typeof result.totalSecrets).toBe('number')
    expect(typeof result.scopes).toBe('object')
  }, TEST_TIMEOUT_MS)
})
