/**
 * Integration tests for DejaService with real libSQL + Transformers.js embeddings.
 * No mocks — tests use an in-memory/temp libSQL database and real embedding model.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { getDb, getDrizzle, initDb } from '../src/db';
import { initEmbeddings, createEmbedding } from '../src/embeddings';
import { DejaService } from '../src/service';

const TEST_DB = `/tmp/deja-test-${process.pid}.db`;
process.env.DB_PATH = TEST_DB;

let service: DejaService;

beforeAll(async () => {
  await initEmbeddings();
  await initDb();
  service = new DejaService(getDb(), getDrizzle());
});

afterEach(async () => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM learnings', args: [] });
  await db.execute({ sql: 'DELETE FROM secrets', args: [] });
  await db.execute({ sql: 'DELETE FROM state_runs', args: [] });
  await db.execute({ sql: 'DELETE FROM state_revisions', args: [] });
  await db.execute({ sql: 'DELETE FROM state_events', args: [] });
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix);
    } catch {}
  }
});

// ── Non-vector tests ────────────────────────────────────────────────

describe('non-vector: getLearnings', () => {
  it('returns learned items filtered by scope', async () => {
    await service.learn('shared', 'deploying services', 'always check health endpoints', 0.8);
    await service.learn('agent:a1', 'testing code', 'run linting first', 0.7);
    await service.learn('shared', 'database migrations', 'always backup first', 0.9);

    const all = await service.getLearnings();
    expect(all.length).toBe(3);

    const shared = await service.getLearnings({ scope: 'shared' });
    expect(shared.length).toBe(2);
    expect(shared.every((l) => l.scope === 'shared')).toBe(true);

    const agent = await service.getLearnings({ scope: 'agent:a1' });
    expect(agent.length).toBe(1);
    expect(agent[0].scope).toBe('agent:a1');
  });

  it('respects limit parameter', async () => {
    await service.learn('shared', 'a', 'learning a', 0.5);
    await service.learn('shared', 'b', 'learning b', 0.5);
    await service.learn('shared', 'c', 'learning c', 0.5);

    const limited = await service.getLearnings({ limit: 2 });
    expect(limited.length).toBe(2);
  });
});

describe('non-vector: secrets CRUD', () => {
  it('sets, gets, updates, and deletes secrets', async () => {
    // Create
    const setResult = await service.setSecret('shared', 'api-key', 'sk-123');
    expect(setResult.success).toBe(true);

    // Read
    const value = await service.getSecret(['shared'], 'api-key');
    expect(value).toBe('sk-123');

    // Update (upsert)
    await service.setSecret('shared', 'api-key', 'sk-456');
    const updated = await service.getSecret(['shared'], 'api-key');
    expect(updated).toBe('sk-456');

    // Delete
    const delResult = await service.deleteSecret('shared', 'api-key');
    expect(delResult.success).toBe(true);

    const gone = await service.getSecret(['shared'], 'api-key');
    expect(gone).toBeNull();
  });

  it('scopes secrets correctly', async () => {
    await service.setSecret('shared', 'shared-token', 'shared-val');
    await service.setSecret('agent:x', 'agent-token', 'agent-val');

    const sharedOnly = await service.getSecret(['shared'], 'shared-token');
    expect(sharedOnly).toBe('shared-val');
    const agentOnly = await service.getSecret(['agent:x'], 'agent-token');
    expect(agentOnly).toBe('agent-val');

    const missingScope = await service.getSecret(['shared'], 'agent-token');
    expect(missingScope).toBeNull();
  });
});

describe('non-vector: stats', () => {
  it('returns correct counts by scope', async () => {
    await service.learn('shared', 'a', 'b', 0.5);
    await service.learn('shared', 'c', 'd', 0.5);
    await service.learn('agent:z', 'e', 'f', 0.5);
    await service.setSecret('shared', 'key', 'val');

    const stats = await service.getStats();
    expect(stats.totalLearnings).toBe(3);
    expect(stats.totalSecrets).toBe(1);
    expect(stats.scopes['shared'].learnings).toBe(2);
    expect(stats.scopes['shared'].secrets).toBe(1);
    expect(stats.scopes['agent:z'].learnings).toBe(1);
  });
});

describe('non-vector: state CRUD', () => {
  const runId = 'test-run-state';

  it('upsertState creates and updates state', async () => {
    const created = await service.upsertState(runId, {
      goal: 'Fix the bug',
      assumptions: ['Code compiles'],
      decisions: [{ text: 'Use patch approach' }],
    });
    expect(created.runId).toBe(runId);
    expect(created.status).toBe('active');
    expect(created.state.goal).toBe('Fix the bug');
    expect(created.revision).toBe(1);
  });

  it('getState retrieves existing state', async () => {
    await service.upsertState(runId, { goal: 'Build feature' });

    const fetched = await service.getState(runId);
    expect(fetched).not.toBeNull();
    expect(fetched!.state.goal).toBe('Build feature');
  });

  it('patchState merges into existing state', async () => {
    await service.upsertState(runId, {
      goal: 'Fix the bug',
      assumptions: ['Code compiles'],
    });

    const patched = await service.patchState(runId, {
      open_questions: ['Is it safe?'],
    });
    expect(patched.state.open_questions).toContain('Is it safe?');
    expect(patched.state.goal).toBe('Fix the bug');
    expect(patched.revision).toBe(2);
  });

  it('addStateEvent records an event', async () => {
    await service.upsertState(runId, { goal: 'Test events' });

    const event = await service.addStateEvent(runId, 'status_change', {
      from: 'pending',
      to: 'active',
    });
    expect(event.success).toBe(true);
    expect(event.id).toBeDefined();
  });

  it('resolveState marks state as resolved', async () => {
    await service.upsertState(runId, {
      goal: 'Resolve me',
      decisions: [{ text: 'Ship it' }],
    });

    const resolved = await service.resolveState(runId, {
      persistToLearn: true,
      scope: 'shared',
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe('resolved');
    expect(resolved!.resolvedAt).toBeDefined();

    // persistToLearn should have created a learning
    const learnings = await service.getLearnings({ scope: 'shared' });
    expect(learnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Vector tests ────────────────────────────────────────────────────

describe('vector: learn + inject roundtrip', () => {
  it('inject returns learned deployment content', async () => {
    await service.learn(
      'shared',
      'deploying to production',
      'always run smoke tests after deploy',
      0.9,
    );
    await service.learn('shared', 'scaling services', 'add horizontal pod autoscaler', 0.8);

    const result = await service.inject(['shared'], 'how to deploy safely', 5);
    expect(result.learnings.length).toBeGreaterThan(0);
    expect(result.prompt.length).toBeGreaterThan(0);
  });
});

describe('vector: query', () => {
  it('returns relevant results for semantic query', async () => {
    await service.learn('shared', 'writing tests', 'use descriptive test names', 0.8);
    await service.learn('shared', 'code review', 'check for security vulnerabilities', 0.7);
    await service.learn('shared', 'cooking pasta', 'boil water first then add salt', 0.6);

    const result = await service.query(['shared'], 'how to write good tests');
    expect(result.learnings.length).toBeGreaterThan(0);
    // The most relevant result should be about testing
    expect(result.learnings[0].trigger).toContain('test');
  });
});

describe('vector: getLearningNeighbors', () => {
  it('finds semantically similar learnings', async () => {
    const l1 = await service.learn(
      'shared',
      'deploying Node.js apps',
      'use process managers like PM2',
      0.8,
    );
    const l2 = await service.learn(
      'shared',
      'deploying Node services',
      'configure health checks and graceful shutdown',
      0.8,
    );
    // Something unrelated
    await service.learn('shared', 'cooking rice', 'use 2:1 water to rice ratio', 0.5);

    const neighbors = await service.getLearningNeighbors(l1.id, 0.5, 10);
    expect(neighbors.length).toBeGreaterThan(0);
    const neighborIds = neighbors.map((n) => n.id);
    expect(neighborIds).toContain(l2.id);
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('deleteLearning removes a single learning', async () => {
    const l = await service.learn('shared', 'temp', 'remove me', 0.5);
    const result = await service.deleteLearning(l.id);
    expect(result.success).toBe(true);

    const remaining = await service.getLearnings();
    expect(remaining.length).toBe(0);
  });

  it('deleteLearnings removes old low-confidence entries', async () => {
    // Insert a "good" learning via service
    const keeper = await service.learn('shared', 'good practice', 'keep this one', 0.9);

    // Insert an old, low-confidence learning via raw SQL
    const embedding = await createEmbedding('When old thing, stale data');
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO learnings (id, trigger, learning, reason, confidence, source, scope, embedding, created_at, recall_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?), ?, 0)`,
      args: [
        'old-item-1',
        'old thing',
        'stale data',
        null,
        0.2,
        null,
        'shared',
        JSON.stringify(embedding),
        '2020-01-01T00:00:00.000Z',
      ],
    });

    // Verify both exist
    const before = await service.getLearnings();
    expect(before.length).toBe(2);

    // Cleanup: delete old + low confidence (AND conditions)
    const result = await service.deleteLearnings({
      confidence_lt: 0.5,
      not_recalled_in_days: 30,
    });
    expect(result.deleted).toBe(1);
    expect(result.ids).toContain('old-item-1');

    // Verify keeper remains
    const after = await service.getLearnings();
    expect(after.length).toBe(1);
    expect(after[0].id).toBe(keeper.id);
  });
});
