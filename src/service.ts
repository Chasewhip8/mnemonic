
import type { Client } from '@libsql/client';
import type { getDrizzle } from './db';
import * as schema from './schema';
import { eq, and, like, desc, sql, inArray } from 'drizzle-orm';
import { createEmbedding } from './embeddings';

// ── Exported interfaces ────────────────────────────────────────────

export interface Learning {
  id: string;
  trigger: string;
  learning: string;
  reason?: string;
  confidence: number;
  source?: string;
  scope: string;
  embedding?: number[];
  createdAt: string;
  lastRecalledAt?: string;
  recallCount: number;
}

export interface Secret {
  name: string;
  value: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  totalLearnings: number;
  totalSecrets: number;
  scopes: Record<string, { learnings: number; secrets: number }>;
}

export interface QueryResult {
  learnings: Learning[];
  hits: Record<string, number>;
}

export interface InjectResult {
  prompt: string;
  learnings: Learning[];
  state?: WorkingStateResponse;
}

export interface InjectTraceResult {
  input_context: string;
  embedding_generated: number[];
  candidates: Array<{
    id: string;
    trigger: string;
    learning: string;
    similarity_score: number;
    passed_threshold: boolean;
  }>;
  threshold_applied: number;
  injected: Learning[];
  duration_ms: number;
  metadata: {
    total_candidates: number;
    above_threshold: number;
    below_threshold: number;
  };
}

export interface WorkingStatePayload {
  goal?: string;
  assumptions?: string[];
  decisions?: Array<{ id?: string; text: string; status?: string }>;
  open_questions?: string[];
  next_actions?: string[];
  confidence?: number;
}

export interface WorkingStateResponse {
  runId: string;
  revision: number;
  status: string;
  state: WorkingStatePayload;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface ResolveStateOptions {
  persistToLearn?: boolean;
  scope?: string;
  summaryStyle?: 'compact' | 'full';
  updatedBy?: string;
}

// ── DejaService ────────────────────────────────────────────────────

export class DejaService {
  constructor(
    private db: Client,
    private drizzle: ReturnType<typeof getDrizzle>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────

  private filterScopesByPriority(scopes: string[]): string[] {
    const priority = ['session:', 'agent:', 'shared'];

    for (const prefix of priority) {
      const matches = scopes.filter((scope) => scope.startsWith(prefix));
      if (matches.length > 0) {
        return matches;
      }
    }


    return scopes.includes('shared') ? ['shared'] : [];
  }

  private convertDbLearning(dbLearning: any): Learning {
    return {
      id: dbLearning.id,
      trigger: dbLearning.trigger,
      learning: dbLearning.learning,
      reason: dbLearning.reason !== null ? dbLearning.reason : undefined,
      confidence: dbLearning.confidence !== null ? dbLearning.confidence : 0,
      source: dbLearning.source !== null ? dbLearning.source : undefined,
      scope: dbLearning.scope,
      embedding: undefined,
      createdAt: dbLearning.createdAt,
      lastRecalledAt: dbLearning.lastRecalledAt ?? undefined,
      recallCount: dbLearning.recallCount ?? 0,
    };
  }

  private convertSqlLearningRow(row: any): Learning {
    return {
      id: String(row.id),
      trigger: String(row.trigger),
      learning: String(row.learning),
      reason: row.reason != null ? String(row.reason) : undefined,
      confidence: row.confidence != null ? Number(row.confidence) : 0,
      source: row.source != null ? String(row.source) : undefined,
      scope: String(row.scope),
      embedding: undefined,
      createdAt: String(row.created_at ?? row.createdAt),
      lastRecalledAt:
        row.last_recalled_at != null
          ? String(row.last_recalled_at)
          : row.lastRecalledAt != null
            ? String(row.lastRecalledAt)
            : undefined,
      recallCount:
        row.recall_count != null
          ? Number(row.recall_count)
          : row.recallCount != null
            ? Number(row.recallCount)
            : 0,
    };
  }

  private normalizeWorkingStatePayload(payload: any): WorkingStatePayload {
    const asStringArray = (value: any): string[] | undefined => {
      if (!Array.isArray(value)) return undefined;
      return value
        .map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
        .filter(Boolean);
    };

    const decisions = Array.isArray(payload?.decisions)
      ? payload.decisions
          .map((d: any) => ({
            id: typeof d?.id === 'string' ? d.id : undefined,
            text: typeof d?.text === 'string' ? d.text.trim() : String(d?.text ?? '').trim(),
            status: typeof d?.status === 'string' ? d.status : undefined,
          }))
          .filter((d: any) => d.text)
      : undefined;

    return {
      goal: typeof payload?.goal === 'string' ? payload.goal.trim() : undefined,
      assumptions: asStringArray(payload?.assumptions),
      decisions,
      open_questions: asStringArray(payload?.open_questions),
      next_actions: asStringArray(payload?.next_actions),
      confidence:
        typeof payload?.confidence === 'number' && Number.isFinite(payload.confidence)
          ? payload.confidence
          : undefined,
    };
  }

  private formatStatePrompt(state: WorkingStateResponse): string {
    const lines: string[] = [];
    lines.push('Working state (live):');
    if (state.state.goal) lines.push(`Goal: ${state.state.goal}`);
    if (state.state.assumptions?.length) {
      lines.push('Assumptions:');
      for (const a of state.state.assumptions) lines.push(`- ${a}`);
    }
    if (state.state.decisions?.length) {
      lines.push('Decisions:');
      for (const d of state.state.decisions) {
        lines.push(`- ${d.text}${d.status ? ` (${d.status})` : ''}`);
      }
    }
    if (state.state.open_questions?.length) {
      lines.push('Open questions:');
      for (const q of state.state.open_questions) lines.push(`- ${q}`);
    }
    if (state.state.next_actions?.length) {
      lines.push('Next actions:');
      for (const a of state.state.next_actions) lines.push(`- ${a}`);
    }
    if (typeof state.state.confidence === 'number') {
      lines.push(`Confidence: ${state.state.confidence}`);
    }
    return lines.join('\n');
  }

  // ── Learnings ──────────────────────────────────────────────────


  async learn(
    scope: string,
    trigger: string,
    learning: string,
    confidence: number = 0.5,
    reason?: string,
    source?: string,
  ): Promise<Learning> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const textForEmbedding = `When ${trigger}, ${learning}`;
    const embedding = await createEmbedding(textForEmbedding);
    const createdAt = new Date().toISOString();

    const newLearning: Learning = {
      id,
      trigger,
      learning,
      reason,
      confidence,
      source,
      scope,
      embedding,
      createdAt,
      recallCount: 0,
    };

    try {
      await this.db.execute({
        sql: `INSERT INTO learnings (id, trigger, learning, reason, confidence, source, scope, embedding, created_at, recall_count)
              VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?), ?, 0)`,
        args: [
          newLearning.id,
          newLearning.trigger,
          newLearning.learning,
          newLearning.reason ?? null,
          newLearning.confidence,
          newLearning.source ?? null,
          newLearning.scope,
          JSON.stringify(newLearning.embedding),
          newLearning.createdAt,
        ],
      });

      return newLearning;
    } catch (error) {
      console.error('Learn error:', error);
      throw error;
    }
  }

  async inject(
    scopes: string[],
    context: string,
    limit: number = 5,
    format: 'prompt' | 'learnings' = 'prompt',
  ): Promise<InjectResult> {
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return { prompt: '', learnings: [] };
    }

    try {
      const embedding = await createEmbedding(context);
      const placeholders = filteredScopes.map(() => '?').join(',');
      const queryResult = await this.db.execute({
        sql: `SELECT id, trigger, learning, reason, confidence, source, scope, created_at, last_recalled_at, recall_count,
                     vector_distance_cos(embedding, vector32(?)) as distance
              FROM learnings
              WHERE scope IN (${placeholders})
              ORDER BY distance ASC
              LIMIT ?`,
        args: [JSON.stringify(embedding), ...filteredScopes, limit],
      });

      const rows = queryResult.rows as any[];
      const learnings = rows
        .map((row) => ({
          learning: this.convertSqlLearningRow(row),
          similarity: 1 - Number(row.distance ?? 0),
        }))
        .filter((entry) => Number.isFinite(entry.similarity))
        .map((entry) => entry.learning);

      if (learnings.length > 0) {
        const now = new Date().toISOString();
        await this.drizzle
          .update(schema.learnings)
          .set({
            lastRecalledAt: now,
            recallCount: sql`COALESCE(${schema.learnings.recallCount}, 0) + 1`,
          })
          .where(inArray(schema.learnings.id, learnings.map((l) => l.id)));
      }

      if (format === 'prompt') {
        const prompt = learnings.map((l) => `When ${l.trigger}, ${l.learning}`).join('\n');
        return { prompt, learnings };
      }

      return { prompt: '', learnings };
    } catch (error) {
      console.error('Inject error:', error);
      return { prompt: '', learnings: [] };
    }
  }

  async injectTrace(
    scopes: string[],
    context: string,
    limit: number = 5,
    threshold: number = 0,
  ): Promise<InjectTraceResult> {
    const startTime = Date.now();
    const filteredScopes = this.filterScopesByPriority(scopes);

    if (filteredScopes.length === 0) {
      return {
        input_context: context,
        embedding_generated: [],
        candidates: [],
        threshold_applied: threshold,
        injected: [],
        duration_ms: Date.now() - startTime,
        metadata: { total_candidates: 0, above_threshold: 0, below_threshold: 0 },
      };
    }

    try {
      const embedding = await createEmbedding(context);
      const placeholders = filteredScopes.map(() => '?').join(',');
      const candidateLimit = Math.max(limit * 3, 20);

      const queryResult = await this.db.execute({
        sql: `SELECT id, trigger, learning, reason, confidence, source, scope, created_at, last_recalled_at, recall_count,
                     vector_distance_cos(embedding, vector32(?)) as distance
              FROM learnings
              WHERE scope IN (${placeholders})
              ORDER BY distance ASC
              LIMIT ?`,
        args: [JSON.stringify(embedding), ...filteredScopes, candidateLimit],
      });

      const rows = queryResult.rows as any[];
      const byId = new Map<string, Learning>();
      for (const row of rows) {
        const converted = this.convertSqlLearningRow(row);
        byId.set(converted.id, converted);
      }

      const candidates = rows.map((row) => {
        const similarity = 1 - Number(row.distance ?? 0);
        return {
          id: String(row.id),
          trigger: String(row.trigger),
          learning: String(row.learning),
          similarity_score: similarity,
          passed_threshold: similarity >= threshold,
        };
      });

      candidates.sort((a, b) => b.similarity_score - a.similarity_score);

      const injected = candidates
        .filter((c) => c.passed_threshold)
        .slice(0, limit)
        .map((c) => byId.get(c.id))
        .filter((l): l is Learning => l !== undefined);

      const above_threshold = candidates.filter((c) => c.passed_threshold).length;

      return {
        input_context: context,
        embedding_generated: embedding,
        candidates,
        threshold_applied: threshold,
        injected,
        duration_ms: Date.now() - startTime,
        metadata: {
          total_candidates: candidates.length,
          above_threshold,
          below_threshold: candidates.length - above_threshold,
        },
      };
    } catch (error) {
      console.error('InjectTrace error:', error);
      return {
        input_context: context,
        embedding_generated: [],
        candidates: [],
        threshold_applied: threshold,
        injected: [],
        duration_ms: Date.now() - startTime,
        metadata: { total_candidates: 0, above_threshold: 0, below_threshold: 0 },
      };
    }
  }

  async query(scopes: string[], text: string, limit: number = 10): Promise<QueryResult> {
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return { learnings: [], hits: {} };
    }

    try {
      const embedding = await createEmbedding(text);
      const placeholders = filteredScopes.map(() => '?').join(',');
      const queryResult = await this.db.execute({
        sql: `SELECT id, trigger, learning, reason, confidence, source, scope, created_at, last_recalled_at, recall_count,
                     vector_distance_cos(embedding, vector32(?)) as distance
              FROM learnings
              WHERE scope IN (${placeholders})
              ORDER BY distance ASC
              LIMIT ?`,
        args: [JSON.stringify(embedding), ...filteredScopes, limit],
      });

      const rows = queryResult.rows as any[];
      const learnings = rows
        .map((row) => ({
          learning: this.convertSqlLearningRow(row),
          similarity: 1 - Number(row.distance ?? 0),
        }))
        .filter((entry) => Number.isFinite(entry.similarity))
        .map((entry) => entry.learning);

      const hits: Record<string, number> = {};
      for (const learning of learnings) {
        hits[learning.scope] = (hits[learning.scope] || 0) + 1;
      }

      return { learnings, hits };
    } catch (error) {
      console.error('Query error:', error);
      return { learnings: [], hits: {} };
    }
  }

  async getLearningNeighbors(
    id: string,
    threshold: number = 0.85,
    limit: number = 10,
  ): Promise<Array<Learning & { similarity_score: number }>> {
    const row = await this.drizzle
      .select({ id: schema.learnings.id })
      .from(schema.learnings)
      .where(eq(schema.learnings.id, id))
      .limit(1);
    if (row.length === 0) return [];

    const candidateLimit = Math.max(limit * 3, 20);
    const queryResult = await this.db.execute({
      sql: `SELECT l2.id, l2.trigger, l2.learning, l2.reason, l2.confidence, l2.source, l2.scope,
                   l2.created_at, l2.last_recalled_at, l2.recall_count,
                   vector_distance_cos(l2.embedding, l1.embedding) as distance
            FROM learnings l2, learnings l1
            WHERE l1.id = ? AND l2.id != ?
            ORDER BY distance ASC
            LIMIT ?`,
      args: [id, id, candidateLimit],
    });

    const rows = queryResult.rows as any[];
    return rows
      .map((row) => {
        const similarity = 1 - Number(row.distance ?? 0);
        return {
          ...this.convertSqlLearningRow(row),
          similarity_score: similarity,
          passed: similarity >= threshold,
        };
      })
      .filter((row) => row.passed)
      .slice(0, limit)
      .map(({ passed: _passed, ...row }) => row);
  }

  async getLearnings(filter?: { scope?: string; limit?: number }): Promise<Learning[]> {
    try {
      let query: any = this.drizzle.select().from(schema.learnings);

      if (filter?.scope) {
        query = query.where(eq(schema.learnings.scope, filter.scope));
      }

      if (filter?.limit) {
        query = query.limit(filter.limit);
      }

      const results = await query.orderBy(desc(schema.learnings.createdAt));
      return results.map((r: any) => this.convertDbLearning(r));
    } catch (error) {
      console.error('Get learnings error:', error);
      return [];
    }
  }

  async deleteLearning(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.drizzle.delete(schema.learnings).where(eq(schema.learnings.id, id));
      return { success: true };
    } catch (error) {
      console.error('Delete learning error:', error);
      return { success: false, error: 'Failed to delete learning' };
    }
  }

  async deleteLearnings(filters: {
    confidence_lt?: number;
    not_recalled_in_days?: number;
    scope?: string;
  }): Promise<{ deleted: number; ids: string[] }> {
    const conditions: ReturnType<typeof sql>[] = [];

    if (filters.confidence_lt != null) {
      conditions.push(sql`${schema.learnings.confidence} < ${filters.confidence_lt}`);
    }
    if (filters.not_recalled_in_days != null) {
      const cutoff = new Date(
        Date.now() - filters.not_recalled_in_days * 24 * 60 * 60 * 1000,
      ).toISOString();
      conditions.push(
        sql`COALESCE(${schema.learnings.lastRecalledAt}, ${schema.learnings.createdAt}) < ${cutoff}`,
      );
    }
    if (filters.scope != null) {
      conditions.push(eq(schema.learnings.scope, filters.scope));
    }

    if (conditions.length === 0) {
      return { deleted: 0, ids: [] };
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const toDelete = await this.drizzle
      .select({ id: schema.learnings.id })
      .from(schema.learnings)
      .where(whereClause);
    const ids = toDelete.map((r) => r.id);
    if (ids.length === 0) return { deleted: 0, ids: [] };

    await this.drizzle.delete(schema.learnings).where(whereClause);
    return { deleted: ids.length, ids };
  }

  // ── Secrets ────────────────────────────────────────────────────

  async getSecret(scopes: string[], name: string): Promise<string | null> {
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return null;
    }

    try {
      const whereClause = and(
        eq(schema.secrets.name, name),
        inArray(schema.secrets.scope, filteredScopes),
      );

      const results = await this.drizzle
        .select()
        .from(schema.secrets)
        .where(whereClause)
        .limit(1);

      return results.length > 0 ? results[0].value : null;
    } catch (error) {
      console.error('Get secret error:', error);
      return null;
    }
  }

  async setSecret(
    scope: string,
    name: string,
    value: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = new Date().toISOString();

      await this.db.execute({
        sql: `INSERT INTO secrets (name, value, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        args: [name, value, scope, now, now],
      });

      return { success: true };
    } catch (error) {
      console.error('Set secret error:', error);
      return { success: false, error: 'Failed to set secret' };
    }
  }

  async deleteSecret(
    scope: string,
    name: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.drizzle
        .delete(schema.secrets)
        .where(and(eq(schema.secrets.name, name), eq(schema.secrets.scope, scope)));

      return { success: true };
    } catch (error) {
      console.error('Delete secret error:', error);
      return { success: false, error: 'Failed to delete secret' };
    }
  }

  // ── Stats ──────────────────────────────────────────────────────

  async getStats(): Promise<Stats> {
    try {
      const learningCountResult = await this.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema.learnings);
      const secretCountResult = await this.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema.secrets);

      const learningCount = learningCountResult[0]?.count || 0;
      const secretCount = secretCountResult[0]?.count || 0;

      const learningByScope = await this.drizzle
        .select({
          scope: schema.learnings.scope,
          count: sql<number>`count(*)`,
        })
        .from(schema.learnings)
        .groupBy(schema.learnings.scope);

      const secretsByScope = await this.drizzle
        .select({
          scope: schema.secrets.scope,
          count: sql<number>`count(*)`,
        })
        .from(schema.secrets)
        .groupBy(schema.secrets.scope);

      const scopes: Record<string, { learnings: number; secrets: number }> = {};

      if (Array.isArray(learningByScope)) {
        learningByScope.forEach((row: any) => {
          if (!scopes[row.scope]) scopes[row.scope] = { learnings: 0, secrets: 0 };
          scopes[row.scope].learnings = row.count;
        });
      }

      if (Array.isArray(secretsByScope)) {
        secretsByScope.forEach((row: any) => {
          if (!scopes[row.scope]) scopes[row.scope] = { learnings: 0, secrets: 0 };
          scopes[row.scope].secrets = row.count;
        });
      }

      return {
        totalLearnings: learningCount,
        totalSecrets: secretCount,
        scopes,
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return { totalLearnings: 0, totalSecrets: 0, scopes: {} };
    }
  }

  // ── Working State ──────────────────────────────────────────────

  async getState(runId: string): Promise<WorkingStateResponse | null> {
    const row = await this.drizzle
      .select()
      .from(schema.stateRuns)
      .where(eq(schema.stateRuns.runId, runId))
      .limit(1);
    if (!row.length) return null;
    const current = row[0] as any;
    return {
      runId: current.runId,
      revision: current.revision,
      status: current.status,
      state: JSON.parse(current.stateJson || '{}'),
      updatedBy: current.updatedBy ?? undefined,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      resolvedAt: current.resolvedAt ?? undefined,
    };
  }

  async upsertState(
    runId: string,
    payload: WorkingStatePayload,
    updatedBy?: string,
    changeSummary: string = 'state upsert',
  ): Promise<WorkingStateResponse> {
    const now = new Date().toISOString();
    const normalized = this.normalizeWorkingStatePayload(payload);

    const existing = await this.getState(runId);
    const nextRevision = (existing?.revision ?? 0) + 1;
    const stateJson = JSON.stringify(normalized);

    if (existing) {
      await this.drizzle
        .update(schema.stateRuns)
        .set({
          revision: nextRevision,
          stateJson,
          status: existing.status,
          updatedBy,
          updatedAt: now,
        })
        .where(eq(schema.stateRuns.runId, runId));
    } else {
      await this.drizzle.insert(schema.stateRuns).values({
        runId,
        revision: nextRevision,
        stateJson,
        status: 'active',
        updatedBy,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      } as any);
    }

    await this.drizzle.insert(schema.stateRevisions).values({
      id: crypto.randomUUID(),
      runId,
      revision: nextRevision,
      stateJson,
      changeSummary,
      updatedBy,
      createdAt: now,
    } as any);

    return (await this.getState(runId)) as WorkingStateResponse;
  }

  async patchState(
    runId: string,
    patch: any,
    updatedBy?: string,
  ): Promise<WorkingStateResponse> {
    const current = (await this.getState(runId)) ?? {
      runId,
      revision: 0,
      status: 'active',
      state: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = {
      ...current.state,
      ...this.normalizeWorkingStatePayload({ ...current.state, ...patch }),
    };
    return this.upsertState(runId, next, updatedBy, 'state patch');
  }

  async addStateEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
    createdBy?: string,
  ): Promise<{ success: true; id: string }> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.drizzle.insert(schema.stateEvents).values({
      id,
      runId,
      eventType,
      payloadJson: JSON.stringify(payload ?? {}),
      createdBy,
      createdAt: now,
    } as any);
    return { success: true, id };
  }

  async resolveState(
    runId: string,
    opts: ResolveStateOptions = {},
  ): Promise<WorkingStateResponse | null> {
    const current = await this.getState(runId);
    if (!current) return null;

    const now = new Date().toISOString();
    await this.drizzle
      .update(schema.stateRuns)
      .set({
        status: 'resolved',
        updatedBy: opts.updatedBy,
        updatedAt: now,
        resolvedAt: now,
      })
      .where(eq(schema.stateRuns.runId, runId));

    if (opts.persistToLearn) {
      const compact = [
        current.state.goal ? `Goal: ${current.state.goal}` : '',
        current.state.decisions?.length
          ? `Decisions: ${current.state.decisions.map((d) => d.text).join('; ')}`
          : '',
        current.state.next_actions?.length
          ? `Next actions: ${current.state.next_actions.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' | ');

      if (compact) {
        await this.learn(
          opts.scope || 'shared',
          `run:${runId} resolved`,
          compact,
          typeof current.state.confidence === 'number' ? current.state.confidence : 0.8,
          'Derived from working state resolve',
          `state:${runId}`,
        );
      }
    }

    return this.getState(runId);
  }

  async cleanup(): Promise<{ deleted: number; reasons: string[] }> {
    const reasons: string[] = [];
    let deleted = 0;

    try {
      // 1. Delete session:* entries older than 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const staleSessionEntries = await this.drizzle.select()
        .from(schema.learnings)
        .where(and(
          like(schema.learnings.scope, 'session:%'),
          sql`${schema.learnings.createdAt} < ${weekAgo}`
        ));
      if (staleSessionEntries.length > 0) {
        deleted += staleSessionEntries.length;
        reasons.push(`${staleSessionEntries.length} stale session entries`);
        await this.drizzle.delete(schema.learnings)
          .where(and(
            like(schema.learnings.scope, 'session:%'),
            sql`${schema.learnings.createdAt} < ${weekAgo}`
          ));
      }

      // 2. Delete agent:* entries older than 30 days
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const staleAgentEntries = await this.drizzle.select()
        .from(schema.learnings)
        .where(and(
          like(schema.learnings.scope, 'agent:%'),
          sql`${schema.learnings.createdAt} < ${monthAgo}`
        ));
      if (staleAgentEntries.length > 0) {
        deleted += staleAgentEntries.length;
        reasons.push(`${staleAgentEntries.length} stale agent entries`);
        await this.drizzle.delete(schema.learnings)
          .where(and(
            like(schema.learnings.scope, 'agent:%'),
            sql`${schema.learnings.createdAt} < ${monthAgo}`
          ));
      }

      // 3. Delete low confidence (< 0.3) entries
      const lowConfEntries = await this.drizzle.select()
        .from(schema.learnings)
        .where(sql`${schema.learnings.confidence} < 0.3`);
      if (lowConfEntries.length > 0) {
        deleted += lowConfEntries.length;
        reasons.push(`${lowConfEntries.length} low confidence entries`);
        await this.drizzle.delete(schema.learnings)
          .where(sql`${schema.learnings.confidence} < 0.3`);
      }

      return { deleted, reasons };
    } catch (error) {
      console.error('Cleanup error:', error);
      return { deleted: 0, reasons: ['Cleanup failed with error'] };
    }
  }
}
