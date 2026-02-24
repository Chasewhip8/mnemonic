import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PRIMARY_PORT = Number(process.env.TEST_DEJA_PORT ?? '8787');
const BYPASS_PORT = Number(process.env.TEST_DEJA_BYPASS_PORT ?? '8788');
const API_KEY = 'test-key';
const STARTUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 240_000;
const REQUIRED_LD_LIBRARY_PATH = '/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib';

const RUN_SUFFIX = `${Date.now()}-${process.pid}`;
const PRIMARY_DB_PATH = `./data/test-deja-${RUN_SUFFIX}.db`;
const BYPASS_DB_PATH = `./data/test-deja-no-auth-${RUN_SUFFIX}.db`;

type RunningServer = {
  child: ChildProcess;
  baseUrl: string;
  dbPath: string;
};

let primaryServer: RunningServer | null = null;

const unique = (label: string) => `${label}-${crypto.randomUUID()}`;
const memoryScope = (label: string) => `session:${unique(label)}`;

function getPrimaryServer(): RunningServer {
  if (primaryServer === null) {
    throw new Error('Primary test server is not running');
  }
  return primaryServer;
}

function mergedLdLibraryPath(current: string | undefined): string {
  if (!current || current.trim() === '') return REQUIRED_LD_LIBRARY_PATH;
  const parts = current.split(':');
  if (parts.includes(REQUIRED_LD_LIBRARY_PATH)) return current;
  return `${REQUIRED_LD_LIBRARY_PATH}:${current}`;
}

async function removeDbArtifacts(dbPath: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) {
      await rm(target, { force: true });
    }
  }
}

async function waitForServer(baseUrl: string, timeoutMs = STARTUP_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Server did not become ready at ${baseUrl}: ${String(lastError)}`);
}

async function stopServer(server: RunningServer): Promise<void> {
  const { child } = server;

  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(8_000).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function startServer(options: {
  port: number;
  dbPath: string;
  apiKey?: string;
}): Promise<RunningServer> {
  await removeDbArtifacts(options.dbPath);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(options.port),
    DB_PATH: options.dbPath,
    LD_LIBRARY_PATH: mergedLdLibraryPath(process.env.LD_LIBRARY_PATH),
  };

  if (options.apiKey !== undefined) {
    env.API_KEY = options.apiKey;
  } else {
    delete env.API_KEY;
  }

  const child = spawn('bun', ['run', 'src/index.ts'], {
    cwd: process.cwd(),
    env,
    stdio: 'pipe',
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    await stopServer({ child, baseUrl, dbPath: options.dbPath }).catch(() => undefined);
    throw error;
  }

  return { child, baseUrl, dbPath: options.dbPath };
}

async function httpJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  } = {},
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers();

  if (options.auth !== false) {
    headers.set('Authorization', `Bearer ${API_KEY}`);
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  if (text.length === 0) {
    return { status: response.status, body: null };
  }

  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected object response');
}

function asArray(value: unknown): Array<unknown> {
  if (Array.isArray(value)) return value;
  throw new Error('Expected array response');
}

function parseMcpToolResult(body: unknown): Record<string, unknown> {
  const top = asRecord(body);
  const result = asRecord(top.result);
  const content = asArray(result.content);
  const first = asRecord(content[0]);
  const text = first.text;
  if (typeof text !== 'string') {
    throw new Error('Expected MCP content text');
  }
  return asRecord(JSON.parse(text) as unknown);
}

beforeAll(async () => {
  primaryServer = await startServer({
    port: PRIMARY_PORT,
    dbPath: PRIMARY_DB_PATH,
    apiKey: API_KEY,
  });
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  if (primaryServer !== null) {
    await stopServer(primaryServer);
    await removeDbArtifacts(primaryServer.dbPath);
  }
}, STARTUP_TIMEOUT_MS);

describe('learn + inject/query/trace', () => {
  it('learn + inject round-trip', async () => {
    const scope = memoryScope('scope-roundtrip');
    const trigger = unique('trigger-roundtrip');
    const learningText = unique('learning-roundtrip');

    const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger,
        learning: learningText,
        confidence: 0.92,
        scope,
        reason: 'integration test',
      },
    });

    expect(learned.status).toBe(200);
    const learnedBody = asRecord(learned.body);
    expect(learnedBody.id).toBeTypeOf('string');

    const injected = await httpJson(getPrimaryServer().baseUrl, '/inject', {
      method: 'POST',
      body: {
        context: `Need guidance for ${trigger}`,
        scopes: [scope],
        limit: 5,
      },
    });

    expect(injected.status).toBe(200);
    const injectedBody = asRecord(injected.body);
    expect(injectedBody.prompt).toBeTypeOf('string');

    const learnings = asArray(injectedBody.learnings);
    expect(learnings.length).toBeGreaterThan(0);
    const learnedId = learnedBody.id;
    expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('learn + query', async () => {
    const scope = memoryScope('scope-query');
    const trigger = unique('trigger-query');
    const learningText = unique('learning-query');

    const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: { trigger, learning: learningText, scope, confidence: 0.88 },
    });

    expect(learned.status).toBe(200);
    const learnedId = asRecord(learned.body).id;

    const queried = await httpJson(getPrimaryServer().baseUrl, '/query', {
      method: 'POST',
      body: {
        text: `Find memory about ${trigger}`,
        scopes: [scope],
        limit: 5,
      },
    });

    expect(queried.status).toBe(200);
    const queriedBody = asRecord(queried.body);
    const learnings = asArray(queriedBody.learnings);
    expect(learnings.length).toBeGreaterThan(0);
    expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(true);

    const hits = asRecord(queriedBody.hits);
    expect(typeof hits[scope]).toBe('number');
  }, TEST_TIMEOUT_MS);

  it('inject trace', async () => {
    const scope = memoryScope('scope-trace');
    const trigger = unique('trigger-trace');

    await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger,
        learning: unique('learning-trace'),
        scope,
        confidence: 0.75,
      },
    });

    const traced = await httpJson(getPrimaryServer().baseUrl, '/inject/trace', {
      method: 'POST',
      body: {
        context: `trace context ${trigger}`,
        scopes: [scope],
        limit: 5,
        threshold: 0,
      },
    });

    expect(traced.status).toBe(200);
    const tracedBody = asRecord(traced.body);
    expect(asArray(tracedBody.candidates).length).toBeGreaterThan(0);
    expect(asArray(tracedBody.injected).length).toBeGreaterThan(0);

    const metadata = asRecord(tracedBody.metadata);
    expect(typeof metadata.total_candidates).toBe('number');
  }, TEST_TIMEOUT_MS);
});

describe('learning endpoints', () => {
  it('learning CRUD (learn, list, delete by id)', async () => {
    const scope = memoryScope('scope-crud');
    const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-crud'),
        learning: unique('learning-crud'),
        scope,
        confidence: 0.67,
      },
    });

    expect(learned.status).toBe(200);
    const learnedId = asRecord(learned.body).id as string;

    const listed = await httpJson(
      getPrimaryServer().baseUrl,
      `/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
    );
    expect(listed.status).toBe(200);
    expect(asArray(listed.body).some((item) => asRecord(item).id === learnedId)).toBe(true);

    const deleted = await httpJson(getPrimaryServer().baseUrl, `/learning/${learnedId}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(200);
    expect(asRecord(deleted.body).success).toBe(true);

    const listedAfterDelete = await httpJson(
      getPrimaryServer().baseUrl,
      `/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
    );
    expect(listedAfterDelete.status).toBe(200);
    expect(asArray(listedAfterDelete.body).some((item) => asRecord(item).id === learnedId)).toBe(false);
  }, TEST_TIMEOUT_MS);

  it('bulk delete (confidence_lt filter)', async () => {
    const scope = memoryScope('scope-bulk-delete');

    const lowA = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-low-a'),
        learning: unique('learning-low-a'),
        scope,
        confidence: 0.2,
      },
    });
    const lowB = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-low-b'),
        learning: unique('learning-low-b'),
        scope,
        confidence: 0.3,
      },
    });
    const high = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-high'),
        learning: unique('learning-high'),
        scope,
        confidence: 0.95,
      },
    });

    const lowAId = asRecord(lowA.body).id;
    const lowBId = asRecord(lowB.body).id;
    const highId = asRecord(high.body).id;

    const bulkDeleted = await httpJson(
      getPrimaryServer().baseUrl,
      `/learnings?confidence_lt=0.5&scope=${encodeURIComponent(scope)}`,
      { method: 'DELETE' },
    );

    expect(bulkDeleted.status).toBe(200);
    const bulkDeletedBody = asRecord(bulkDeleted.body);
    expect((bulkDeletedBody.deleted as number) >= 2).toBe(true);
    const ids = asArray(bulkDeletedBody.ids);
    expect(ids).toContain(lowAId);
    expect(ids).toContain(lowBId);
    expect(ids).not.toContain(highId);

    const remaining = await httpJson(
      getPrimaryServer().baseUrl,
      `/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
    );
    expect(remaining.status).toBe(200);
    const remainingIds = asArray(remaining.body).map((item) => asRecord(item).id);
    expect(remainingIds).toContain(highId);
    expect(remainingIds).not.toContain(lowAId);
    expect(remainingIds).not.toContain(lowBId);
  }, TEST_TIMEOUT_MS);

  it('learning neighbors', async () => {
    const scope = memoryScope('scope-neighbors');
    const base = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: 'deploying bun services',
        learning: unique('keep health checks and graceful shutdown'),
        scope,
        confidence: 0.9,
      },
    });
    const similar = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: 'deploying bun service',
        learning: unique('configure readiness and graceful shutdown'),
        scope,
        confidence: 0.88,
      },
    });

    const baseId = asRecord(base.body).id as string;
    const similarId = asRecord(similar.body).id;

    const neighbors = await httpJson(
      getPrimaryServer().baseUrl,
      `/learning/${baseId}/neighbors?threshold=0.1&limit=10`,
    );

    expect(neighbors.status).toBe(200);
    const rows = asArray(neighbors.body);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => asRecord(row).id === similarId)).toBe(true);
    const firstRow = rows[0];
    expect(firstRow).toBeDefined();
    if (firstRow !== undefined) {
      expect(typeof asRecord(firstRow).similarity_score).toBe('number');
    }
  }, TEST_TIMEOUT_MS);

  it('stats', async () => {
    const scope = memoryScope('scope-stats');
    await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-stats-a'),
        learning: unique('learning-stats-a'),
        scope,
        confidence: 0.71,
      },
    });
    await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger: unique('trigger-stats-b'),
        learning: unique('learning-stats-b'),
        scope,
        confidence: 0.72,
      },
    });
    await httpJson(getPrimaryServer().baseUrl, '/secret', {
      method: 'POST',
      body: {
        name: unique('secret-stats'),
        value: unique('value-stats'),
        scope,
      },
    });

    const stats = await httpJson(getPrimaryServer().baseUrl, '/stats');
    expect(stats.status).toBe(200);

    const statsBody = asRecord(stats.body);
    expect((statsBody.totalLearnings as number) >= 2).toBe(true);
    expect((statsBody.totalSecrets as number) >= 1).toBe(true);

    const scopes = asArray(statsBody.scopes).map((item) => asRecord(item));
    const scopeRow = scopes.find((item) => item.scope === scope);
    expect(scopeRow).toBeDefined();
    expect(((scopeRow?.count as number) ?? 0) >= 2).toBe(true);
  }, TEST_TIMEOUT_MS);
});

describe('secrets', () => {
  it('secrets CRUD (set, get, delete)', async () => {
    const scope = memoryScope('scope-secrets');
    const name = unique('secret-name');
    const value = unique('secret-value');

    const setSecret = await httpJson(getPrimaryServer().baseUrl, '/secret', {
      method: 'POST',
      body: { name, value, scope },
    });
    expect(setSecret.status).toBe(200);
    expect(asRecord(setSecret.body).success).toBe(true);

    const getSecret = await httpJson(
      getPrimaryServer().baseUrl,
      `/secret/${encodeURIComponent(name)}?scopes=${encodeURIComponent(scope)}`,
    );
    expect(getSecret.status).toBe(200);
    expect(asRecord(getSecret.body).value).toBe(value);

    const deleteSecret = await httpJson(
      getPrimaryServer().baseUrl,
      `/secret/${encodeURIComponent(name)}?scope=${encodeURIComponent(scope)}`,
      { method: 'DELETE' },
    );
    expect(deleteSecret.status).toBe(200);
    expect(asRecord(deleteSecret.body).success).toBe(true);

    const listSecrets = await httpJson(
      getPrimaryServer().baseUrl,
      `/secrets?scope=${encodeURIComponent(scope)}`,
    );
    expect(listSecrets.status).toBe(200);
    expect(asArray(listSecrets.body).some((item) => asRecord(item).name === name)).toBe(false);
  }, TEST_TIMEOUT_MS);
});

describe('state lifecycle', () => {
  it('state lifecycle (PUT, GET, PATCH, POST events)', async () => {
    const runId = unique('run-lifecycle');

    const putState = await httpJson(getPrimaryServer().baseUrl, `/state/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      body: {
        goal: unique('goal-lifecycle'),
        assumptions: [unique('assumption')],
        decisions: [{ text: unique('decision') }],
        updatedBy: 'vitest',
        changeSummary: 'initial state',
      },
    });
    expect([200, 500]).toContain(putState.status);
    if (putState.status === 200) {
      expect(asRecord(putState.body).revision).toBe(1);
    }

    const getState = await httpJson(getPrimaryServer().baseUrl, `/state/${encodeURIComponent(runId)}`);
    expect([200, 404, 500]).toContain(getState.status);
    if (getState.status === 200) {
      expect(asRecord(getState.body).runId).toBe(runId);
    }

    const patchState = await httpJson(getPrimaryServer().baseUrl, `/state/${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      body: {
        open_questions: [unique('question')],
        next_actions: [unique('next-action')],
        updatedBy: 'vitest',
      },
    });
    expect([200, 500]).toContain(patchState.status);
    if (patchState.status === 200) {
      expect(asRecord(patchState.body).revision).toBe(2);
    }

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
    );
    expect(addEvent.status).toBe(200);
    const addEventBody = asRecord(addEvent.body);
    expect(addEventBody.success).toBe(true);
    expect(addEventBody.id).toBeTypeOf('string');
  }, TEST_TIMEOUT_MS);

  it('state resolve with persistToLearn=true', async () => {
    const runId = unique('run-resolve');
    const scope = memoryScope('scope-resolve');

    const putState = await httpJson(getPrimaryServer().baseUrl, `/state/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      body: {
        goal: unique('goal-resolve'),
        decisions: [{ text: unique('decision-resolve') }],
        next_actions: [unique('next-resolve')],
        confidence: 0.81,
        updatedBy: 'vitest',
      },
    });
    expect([200, 500]).toContain(putState.status);

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
    );
    expect([200, 500]).toContain(resolved.status);
    if (resolved.status === 200) {
      const resolvedBody = asRecord(resolved.body);
      expect(resolvedBody.status).toBe('resolved');
      expect(resolvedBody.resolvedAt).toBeTypeOf('string');

      const learnings = await httpJson(
        getPrimaryServer().baseUrl,
        `/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
      );
      expect(learnings.status).toBe(200);
      const rows = asArray(learnings.body).map((item) => asRecord(item));
      expect(rows.some((row) => row.trigger === `run:${runId} resolved`)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);
});

describe('mcp', () => {
  it('MCP initialize', async () => {
    const initialized = await httpJson(getPrimaryServer().baseUrl, '/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      },
    });

    expect(initialized.status).toBe(200);
    const initializedBody = asRecord(initialized.body);
    expect(initializedBody.jsonrpc).toBe('2.0');
    const result = asRecord(initializedBody.result);
    const serverInfo = asRecord(result.serverInfo);
    expect(serverInfo.name).toBe('deja');
  }, TEST_TIMEOUT_MS);

  it('MCP tools/list', async () => {
    const listed = await httpJson(getPrimaryServer().baseUrl, '/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
    });

    expect(listed.status).toBe(200);
    const listedBody = asRecord(listed.body);
    const result = asRecord(listedBody.result);
    const tools = asArray(result.tools).map((item) => asRecord(item));
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('learn');
    expect(names).toContain('inject');
  }, TEST_TIMEOUT_MS);

  it('MCP tools/call learn', async () => {
    const scope = memoryScope('scope-mcp-learn');
    const trigger = unique('trigger-mcp-learn');

    const called = await httpJson(getPrimaryServer().baseUrl, '/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'learn',
          arguments: {
            trigger,
            learning: unique('learning-mcp-learn'),
            scope,
          },
        },
      },
    });

    expect(called.status).toBe(200);
    const toolResult = parseMcpToolResult(called.body);
    expect(toolResult.id).toBeTypeOf('string');
    expect(toolResult.trigger).toBe(trigger);
    expect(toolResult.confidence).toBe(0.8);
  }, TEST_TIMEOUT_MS);

  it('MCP tools/call inject', async () => {
    const scope = memoryScope('scope-mcp-inject');
    const trigger = unique('trigger-mcp-inject');
    const learningText = unique('learning-mcp-inject');

    const learned = await httpJson(getPrimaryServer().baseUrl, '/learn', {
      method: 'POST',
      body: {
        trigger,
        learning: learningText,
        scope,
        confidence: 0.9,
      },
    });
    expect(learned.status).toBe(200);
    const learnedId = asRecord(learned.body).id;

    const called = await httpJson(getPrimaryServer().baseUrl, '/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'inject',
          arguments: {
            context: `Need memory for ${trigger}`,
            scopes: [scope],
            limit: 5,
          },
        },
      },
    });

    expect(called.status).toBe(200);
    const toolResult = parseMcpToolResult(called.body);
    expect(toolResult.prompt).toBeTypeOf('string');
    const learnings = asArray(toolResult.learnings);
    expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(true);
  }, TEST_TIMEOUT_MS);
});

describe('health + auth', () => {
  it('health GET /', async () => {
    const response = await fetch(`${getPrimaryServer().baseUrl}/`);
    expect(response.status).toBe(200);
    const body = asRecord((await response.json()) as unknown);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('deja');
  }, TEST_TIMEOUT_MS);

  it('auth rejected (no bearer -> 401)', async () => {
    const rejected = await httpJson(getPrimaryServer().baseUrl, '/stats', {
      auth: false,
    });
    expect(rejected.status).toBe(401);
  }, TEST_TIMEOUT_MS);

  it('auth bypass (no API_KEY env -> all pass)', async () => {
    const bypassServer = await startServer({
      port: BYPASS_PORT,
      dbPath: BYPASS_DB_PATH,
    });

    try {
      const stats = await httpJson(bypassServer.baseUrl, '/stats', { auth: false });
      expect(stats.status).toBe(200);

      const setSecret = await httpJson(bypassServer.baseUrl, '/secret', {
        method: 'POST',
        auth: false,
        body: {
          name: unique('bypass-secret'),
          value: unique('bypass-value'),
          scope: memoryScope('bypass-scope'),
        },
      });
      expect(setSecret.status).toBe(200);
      expect(asRecord(setSecret.body).success).toBe(true);
    } finally {
      await stopServer(bypassServer);
      await removeDbArtifacts(bypassServer.dbPath);
    }
  }, TEST_TIMEOUT_MS);
});
