/**
 * DejaDO - Durable Object implementation for deja
 * 
 * Each user gets their own isolated DejaDO instance with SQLite storage.
 */
import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import * as schema from '../schema';
import { eq, and, like, desc, sql, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  API_KEY?: string;
}

// Types for our methods
interface Learning {
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

interface Secret {
  name: string;
  value: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalLearnings: number;
  totalSecrets: number;
  scopes: Record<string, { learnings: number; secrets: number }>;
}

interface QueryResult {
  learnings: Learning[];
  hits: Record<string, number>;
}

interface InjectResult {
  prompt: string;
  learnings: Learning[];
  state?: WorkingStateResponse;
}

interface InjectTraceResult {
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

interface WorkingStatePayload {
  goal?: string;
  assumptions?: string[];
  decisions?: Array<{ id?: string; text: string; status?: string }>;
  open_questions?: string[];
  next_actions?: string[];
  confidence?: number;
}

interface WorkingStateResponse {
  runId: string;
  revision: number;
  status: string;
  state: WorkingStatePayload;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

interface ResolveStateOptions {
  persistToLearn?: boolean;
  scope?: string;
  summaryStyle?: 'compact' | 'full';
  updatedBy?: string;
}

export class DejaDO extends DurableObject<Env> {
  private db: ReturnType<typeof drizzle> | null = null;
  private app: Hono<{ Bindings: Env }> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    state.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS learnings (
          id TEXT PRIMARY KEY,
          trigger TEXT NOT NULL,
          learning TEXT NOT NULL,
          reason TEXT,
          confidence REAL DEFAULT 1.0,
          source TEXT,
          scope TEXT NOT NULL,
          embedding TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_learnings_trigger ON learnings(trigger);
        CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings(confidence);
        CREATE INDEX IF NOT EXISTS idx_learnings_created_at ON learnings(created_at);
        CREATE INDEX IF NOT EXISTS idx_learnings_scope ON learnings(scope);
      `);
      try {
        this.ctx.storage.sql.exec(`ALTER TABLE learnings ADD COLUMN last_recalled_at TEXT`);
      } catch (_) {}
      try {
        this.ctx.storage.sql.exec(`ALTER TABLE learnings ADD COLUMN recall_count INTEGER DEFAULT 0`);
      } catch (_) {}
      try {
        this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS idx_learnings_last_recalled_at ON learnings(last_recalled_at)`);
      } catch (_) {}
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS secrets (
          name TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          scope TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_secrets_scope ON secrets(scope);
      `);
    });
  }

  /**
   * Initialize the database connection
   */
  private async initDB() {
    if (this.db) return this.db;
    
    try {
      // Use durable-sqlite driver for DO storage
      this.db = drizzle(this.ctx.storage, { schema });
      return this.db;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  /**
   * Create embedding for text using Workers AI
   */
  private async createEmbedding(text: string): Promise<number[]> {
    try {
      // @ts-ignore - Cloudflare types
      // bge-small outputs 384 dims to match our Vectorize index
      const response: any = await this.env.AI.run('@cf/baai/bge-small-en-v1.5', { text });
      // Check if it's a direct response or async response
      if (response.data && response.data[0]) {
        return response.data[0];
      } else {
        // For async responses, we might need to poll
        // For now, let's assume it's direct
        return response;
      }
    } catch (error) {
      console.error('Embedding creation error:', error);
      throw error;
    }
  }

  /**
   * Filter scopes by priority - first match wins
   * Priority order: session:<id>, agent:<id>, shared
   */
  private filterScopesByPriority(scopes: string[]): string[] {
    const priority = ['session:', 'agent:', 'shared'];
    const filtered: string[] = [];
    
    for (const prefix of priority) {
      const matches = scopes.filter(scope => scope.startsWith(prefix));
      if (matches.length > 0) {
        return matches; // Return first match type
      }
    }
    
    // If no matches, return shared if in scopes
    return scopes.includes('shared') ? ['shared'] : [];
  }

  /**
   * Convert database learning to our Learning interface
   */
  private convertDbLearning(dbLearning: any): Learning {
    return {
      id: dbLearning.id,
      trigger: dbLearning.trigger,
      learning: dbLearning.learning,
      reason: dbLearning.reason !== null ? dbLearning.reason : undefined,
      confidence: dbLearning.confidence !== null ? dbLearning.confidence : 0,
      source: dbLearning.source !== null ? dbLearning.source : undefined,
      scope: dbLearning.scope,
      embedding: dbLearning.embedding ? JSON.parse(dbLearning.embedding) : undefined,
      createdAt: dbLearning.createdAt,
      lastRecalledAt: dbLearning.lastRecalledAt ?? undefined,
      recallCount: dbLearning.recallCount ?? 0,
    };
  }

  /**
   * Cleanup method for scheduled tasks
   * Delete stale session entries and low confidence entries
   */
  async cleanup(): Promise<{ deleted: number; reasons: string[] }> {
    const db = await this.initDB();
    const reasons: string[] = [];
    let deleted = 0;

    try {
      // 1. Delete session:* entries older than 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      // First get the entries to delete (we need their IDs for Vectorize)
      const staleSessionEntries = await db.select().from(schema.learnings)
        .where(and(
          like(schema.learnings.scope, 'session:%'),
          sql`${schema.learnings.createdAt} < ${weekAgo}`
        ));
      
      if (staleSessionEntries.length > 0) {
        deleted += staleSessionEntries.length;
        reasons.push(`${staleSessionEntries.length} stale session entries`);
        
        // Delete from DB
        await db.delete(schema.learnings)
          .where(and(
            like(schema.learnings.scope, 'session:%'),
            sql`${schema.learnings.createdAt} < ${weekAgo}`
          ));
        
        // Also delete from vectorize
        const ids = staleSessionEntries.map(entry => entry.id);
        await this.env.VECTORIZE.deleteByIds(ids);
      }

      // 2. Delete agent:* entries older than 30 days
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      // First get the entries to delete (we need their IDs for Vectorize)
      const staleAgentEntries = await db.select().from(schema.learnings)
        .where(and(
          like(schema.learnings.scope, 'agent:%'),
          sql`${schema.learnings.createdAt} < ${monthAgo}`
        ));
      
      if (staleAgentEntries.length > 0) {
        deleted += staleAgentEntries.length;
        reasons.push(`${staleAgentEntries.length} stale agent entries`);
        
        // Delete from DB
        await db.delete(schema.learnings)
          .where(and(
            like(schema.learnings.scope, 'agent:%'),
            sql`${schema.learnings.createdAt} < ${monthAgo}`
          ));
        
        // Also delete from vectorize
        const ids = staleAgentEntries.map(entry => entry.id);
        await this.env.VECTORIZE.deleteByIds(ids);
      }

      // 3. Delete low confidence (< 0.3) entries
      const lowConfEntries = await db.select().from(schema.learnings)
        .where(sql`${schema.learnings.confidence} < 0.3`);
      
      if (lowConfEntries.length > 0) {
        deleted += lowConfEntries.length;
        reasons.push(`${lowConfEntries.length} low confidence entries`);
        
        // Delete from DB
        await db.delete(schema.learnings)
          .where(sql`${schema.learnings.confidence} < 0.3`);
        
        // Also delete from vectorize
        const ids = lowConfEntries.map(entry => entry.id);
        await this.env.VECTORIZE.deleteByIds(ids);
      }

      return { deleted, reasons };
    } catch (error) {
      console.error('Cleanup error:', error);
      return { deleted: 0, reasons: ['Cleanup failed with error'] };
    }
  }

  /**
   * RPC METHODS - Direct method calls for service binding
   */

  /**
   * Inject relevant memories into a prompt
   * @param scopes Scopes to search in (shared, agent:<id>, session:<id>)
   * @param context Context to find relevant memories for
   * @param limit Maximum number of memories to return
   * @param format Format of the result (prompt or learnings)
   * @returns Injected prompt or learnings
   */
  async inject(scopes: string[], context: string, limit: number = 5, format: 'prompt' | 'learnings' = 'prompt'): Promise<InjectResult> {
    const db = await this.initDB();
    
    // Filter scopes by priority
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return { prompt: '', learnings: [] };
    }
    
    try {
      // Create embedding for context
      const embedding = await this.createEmbedding(context);
      
      // Query Vectorize for similar embeddings
      const vectorResults = await this.env.VECTORIZE.query(embedding, { 
        topK: limit * 2, // Get more results to filter by scope
        returnValues: true 
      });
      
      // Extract IDs from vector results
      const ids = vectorResults.matches.map(match => match.id);
      
      if (ids.length === 0) {
        return { prompt: '', learnings: [] };
      }
      
      // Get learnings from DB, filter by scope and IDs
      const whereClause = and(
        inArray(schema.learnings.id, ids),
        inArray(schema.learnings.scope, filteredScopes)
      );
      
      const dbLearnings = await db.select().from(schema.learnings).where(whereClause).limit(limit);
      
      // Convert to our Learning interface
      const learnings = dbLearnings.map(this.convertDbLearning);
      
      // Update recall tracking for returned learnings
      const now = new Date().toISOString();
      const hitUpdates = learnings.map(learning =>
        db.update(schema.learnings)
          .set({
            lastRecalledAt: now,
            recallCount: sql`COALESCE(${schema.learnings.recallCount}, 0) + 1`,
          })
          .where(eq(schema.learnings.id, learning.id))
      );

      await Promise.all(hitUpdates);
      
      // Format result based on requested format
      if (format === 'prompt') {
        const prompt = learnings.map(l => `When ${l.trigger}, ${l.learning}`).join('\n');
        return { prompt, learnings };
      } else {
        return { prompt: '', learnings };
      }
    } catch (error) {
      console.error('Inject error:', error);
      return { prompt: '', learnings: [] };
    }
  }

  /**
   * Instrumented inject - returns full retrieval pipeline for debugging
   */
  async injectTrace(
    scopes: string[],
    context: string,
    limit: number = 5,
    threshold: number = 0
  ): Promise<InjectTraceResult> {
    const startTime = Date.now();
    const db = await this.initDB();

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
      const embedding = await this.createEmbedding(context);
      const vectorResults = await this.env.VECTORIZE.query(embedding, {
        topK: Math.max(limit * 3, 20),
        returnValues: true,
      });

      const scoreById = new Map<string, number>(
        vectorResults.matches.map((m) => [m.id, m.score ?? 0])
      );
      const ids = vectorResults.matches.map((m) => m.id);

      if (ids.length === 0) {
        return {
          input_context: context,
          embedding_generated: embedding,
          candidates: [],
          threshold_applied: threshold,
          injected: [],
          duration_ms: Date.now() - startTime,
          metadata: { total_candidates: 0, above_threshold: 0, below_threshold: 0 },
        };
      }

      const whereClause = and(
        inArray(schema.learnings.id, ids),
        inArray(schema.learnings.scope, filteredScopes)
      );
      const dbLearnings = await db.select().from(schema.learnings).where(whereClause);

      const candidates = dbLearnings.map((row) => {
        const learning = this.convertDbLearning(row);
        const similarity_score = scoreById.get(row.id) ?? 0;
        return {
          id: learning.id,
          trigger: learning.trigger,
          learning: learning.learning,
          similarity_score,
          passed_threshold: similarity_score >= threshold,
        };
      });

      candidates.sort((a, b) => b.similarity_score - a.similarity_score);

      const injected = candidates
        .filter((c) => c.passed_threshold)
        .slice(0, limit)
        .map((c) => {
          const full = dbLearnings.find((r) => r.id === c.id);
          return full ? this.convertDbLearning(full) : null;
        })
        .filter((l): l is Learning => l !== null);

      const above_threshold = candidates.filter((c) => c.passed_threshold).length;
      const below_threshold = candidates.length - above_threshold;

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
          below_threshold,
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

  /**
   * Learn a new memory
   * @param scope Scope to store the learning in
   * @param trigger When to apply this learning
   * @param learning What to do
   * @param confidence Confidence level (0-1)
   * @param reason Reason for the learning
   * @param source Source of the learning
   * @returns Created learning
   */
  async learn(scope: string, trigger: string, learning: string, confidence: number = 0.5, reason?: string, source?: string): Promise<Learning> {
    const db = await this.initDB();
    
    // Generate ID
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create embedding
    const textForEmbedding = `When ${trigger}, ${learning}`;
    const embedding = await this.createEmbedding(textForEmbedding);
    
    // Create learning object
    const newLearning: Learning = {
      id,
      trigger,
      learning,
      reason,
      confidence,
      source,
      scope,
      embedding,
      createdAt: new Date().toISOString(),
      recallCount: 0,
    };
    
    try {
      // Insert into DB
      await db.insert(schema.learnings).values({
        id: newLearning.id,
        trigger: newLearning.trigger,
        learning: newLearning.learning,
        reason: newLearning.reason,
        confidence: newLearning.confidence,
        source: newLearning.source,
        scope: newLearning.scope,
        embedding: newLearning.embedding ? JSON.stringify(newLearning.embedding) : null,
        createdAt: newLearning.createdAt
      });
      
      // Insert into Vectorize
      await this.env.VECTORIZE.insert([{
        id: newLearning.id,
        values: newLearning.embedding || [],
        metadata: {
          scope: newLearning.scope,
          trigger: newLearning.trigger,
          learning: newLearning.learning
        }
      }]);
      
      return newLearning;
    } catch (error) {
      console.error('Learn error:', error);
      throw error;
    }
  }

  /**
   * Get semantically similar memories for a learning (for contradiction/overlap checks)
   */
  async getLearningNeighbors(id: string, threshold: number = 0.85, limit: number = 10): Promise<Array<Learning & { similarity_score: number }>> {
    const db = await this.initDB();
    const row = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id)).limit(1);
    if (row.length === 0) return [];
    const learning = row[0];
    const embeddingJson = learning.embedding;
    if (!embeddingJson) return [];
    const embedding = JSON.parse(embeddingJson) as number[];
    const vectorResults = await this.env.VECTORIZE.query(embedding, { topK: limit + 5, returnValues: true });
    const neighborMatches = vectorResults.matches
      .filter((m) => m.id !== id && (m.score ?? 0) >= threshold)
      .slice(0, limit);
    if (neighborMatches.length === 0) return [];
    const ids = neighborMatches.map((m) => m.id);
    const scoreById = new Map(neighborMatches.map((m) => [m.id, m.score ?? 0]));
    const dbNeighbors = await db.select().from(schema.learnings).where(inArray(schema.learnings.id, ids));
    return dbNeighbors.map((r) => ({
      ...this.convertDbLearning(r),
      similarity_score: scoreById.get(r.id) ?? 0,
    }));
  }

  /**
   * Query for learnings by text
   * @param scopes Scopes to search in
   * @param text Text to search for
   * @param limit Maximum number of results
   * @returns Query results
   */
  async query(scopes: string[], text: string, limit: number = 10): Promise<QueryResult> {
    const db = await this.initDB();
    
    // Filter scopes by priority
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return { learnings: [], hits: {} };
    }
    
    try {
      // Create embedding for search text
      const embedding = await this.createEmbedding(text);
      
      // Query Vectorize
      const vectorResults = await this.env.VECTORIZE.query(embedding, { 
        topK: limit * 2, 
        returnValues: true 
      });
      
      // Extract IDs and scores
      const matches = vectorResults.matches.map(match => ({ id: match.id, score: match.score }));
      const ids = matches.map(match => match.id);
      
      if (ids.length === 0) {
        return { learnings: [], hits: {} };
      }
      
      // Get learnings from DB, filter by scope and IDs
      const whereClause = and(
        inArray(schema.learnings.id, ids),
        inArray(schema.learnings.scope, filteredScopes)
      );
      
      const dbLearnings = await db.select().from(schema.learnings).where(whereClause).limit(limit);
      
      // Convert to our Learning interface
      const learnings = dbLearnings.map(this.convertDbLearning);
      
      // Sort by vector similarity score
      const sortedLearnings = learnings.sort((a, b) => {
        const scoreA = matches.find(m => m.id === a.id)?.score || 0;
        const scoreB = matches.find(m => m.id === b.id)?.score || 0;
        return scoreB - scoreA;
      });
      
      // Count hits by scope
      const hits: Record<string, number> = {};
      sortedLearnings.forEach(learning => {
        hits[learning.scope] = (hits[learning.scope] || 0) + 1;
      });
      
      return { learnings: sortedLearnings, hits };
    } catch (error) {
      console.error('Query error:', error);
      return { learnings: [], hits: {} };
    }
  }

  /**
   * Get learnings with optional filtering
   * @param filter Filter options
   * @returns List of learnings
   */
  async getLearnings(filter?: { scope?: string; limit?: number }): Promise<Learning[]> {
    const db = await this.initDB();
    
    try {
      let query: any = db.select().from(schema.learnings);
      
      if (filter?.scope) {
        query = query.where(eq(schema.learnings.scope, filter.scope));
      }
      
      if (filter?.limit) {
        query = query.limit(filter.limit);
      }
      
      const results = await query.orderBy(desc(schema.learnings.createdAt));
      return results.map(this.convertDbLearning);
    } catch (error) {
      console.error('Get learnings error:', error);
      return [];
    }
  }

  /**
   * Delete a learning by ID
   * @param id Learning ID
   * @returns Success status
   */
  async deleteLearning(id: string): Promise<{ success: boolean; error?: string }> {
    const db = await this.initDB();
    
    try {
      // Delete from DB
      await db.delete(schema.learnings).where(eq(schema.learnings.id, id));
      
      // Delete from Vectorize
      await this.env.VECTORIZE.deleteByIds([id]);
      
      return { success: true };
    } catch (error) {
      console.error('Delete learning error:', error);
      return { success: false, error: 'Failed to delete learning' };
    }
  }

  /**
   * Bulk delete learnings by filters. Requires at least one filter.
   */
  async deleteLearnings(filters: {
    confidence_lt?: number;
    not_recalled_in_days?: number;
    scope?: string;
  }): Promise<{ deleted: number; ids: string[] }> {
    const db = await this.initDB();
    const conditions: ReturnType<typeof sql>[] = [];

    if (filters.confidence_lt != null) {
      conditions.push(sql`${schema.learnings.confidence} < ${filters.confidence_lt}`);
    }
    if (filters.not_recalled_in_days != null) {
      const cutoff = new Date(Date.now() - filters.not_recalled_in_days * 24 * 60 * 60 * 1000).toISOString();
      conditions.push(
        sql`COALESCE(${schema.learnings.lastRecalledAt}, ${schema.learnings.createdAt}) < ${cutoff}`
      );
    }
    if (filters.scope != null) {
      conditions.push(eq(schema.learnings.scope, filters.scope));
    }

    if (conditions.length === 0) {
      return { deleted: 0, ids: [] };
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const toDelete = await db.select({ id: schema.learnings.id }).from(schema.learnings).where(whereClause);
    const ids = toDelete.map((r) => r.id);
    if (ids.length === 0) return { deleted: 0, ids: [] };

    await db.delete(schema.learnings).where(whereClause);
    await this.env.VECTORIZE.deleteByIds(ids);
    return { deleted: ids.length, ids };
  }

  /**
   * Get a secret by name, checking scopes in priority order
   * @param scopes Scopes to search in
   * @param name Secret name
   * @returns Secret value or null
   */
  async getSecret(scopes: string[], name: string): Promise<string | null> {
    const db = await this.initDB();
    
    // Filter scopes by priority
    const filteredScopes = this.filterScopesByPriority(scopes);
    if (filteredScopes.length === 0) {
      return null;
    }
    
    try {
      // Query secrets, filter by scope and name
      const whereClause = and(
        eq(schema.secrets.name, name),
        inArray(schema.secrets.scope, filteredScopes)
      );
      
      const results = await db.select().from(schema.secrets).where(whereClause).limit(1);
      
      return results.length > 0 ? results[0].value : null;
    } catch (error) {
      console.error('Get secret error:', error);
      return null;
    }
  }

  /**
   * Set a secret
   * @param scope Scope to store in
   * @param name Secret name
   * @param value Secret value
   * @returns Success status
   */
  async setSecret(scope: string, name: string, value: string): Promise<{ success: boolean; error?: string }> {
    const db = await this.initDB();
    
    try {
      const now = new Date().toISOString();
      
      // Try to update first
      const result: any = await db.update(schema.secrets)
        .set({ 
          value, 
          updatedAt: now 
        })
        .where(and(
          eq(schema.secrets.name, name),
          eq(schema.secrets.scope, scope)
        ));
      
      // If no rows were updated, insert
      // @ts-ignore - Drizzle result type
      if (result.rowsAffected === 0) {
        await db.insert(schema.secrets).values({
          name,
          value,
          scope,
          createdAt: now,
          updatedAt: now
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error('Set secret error:', error);
      return { success: false, error: 'Failed to set secret' };
    }
  }

  /**
   * Delete a secret
   * @param scope Scope to delete from
   * @param name Secret name
   * @returns Success status
   */
  async deleteSecret(scope: string, name: string): Promise<{ success: boolean; error?: string }> {
    const db = await this.initDB();
    
    try {
      await db.delete(schema.secrets)
        .where(and(
          eq(schema.secrets.name, name),
          eq(schema.secrets.scope, scope)
        ));
      
      return { success: true };
    } catch (error) {
      console.error('Delete secret error:', error);
      return { success: false, error: 'Failed to delete secret' };
    }
  }

  /**
   * Get statistics about stored learnings and secrets
   * @returns Statistics
   */
  async getStats(): Promise<Stats> {
    const db = await this.initDB();
    
    try {
      // Get total counts
      const learningCountResult = await db.select({ count: sql<number>`count(*)` }).from(schema.learnings);
      const secretCountResult = await db.select({ count: sql<number>`count(*)` }).from(schema.secrets);
      
      const learningCount = learningCountResult[0]?.count || 0;
      const secretCount = secretCountResult[0]?.count || 0;
      
      // Get scope breakdown
      const learningByScope = await db.select({
        scope: schema.learnings.scope,
        count: sql<number>`count(*)`
      }).from(schema.learnings).groupBy(schema.learnings.scope);
      
      const secretsByScope = await db.select({
        scope: schema.secrets.scope,
        count: sql<number>`count(*)`
      }).from(schema.secrets).groupBy(schema.secrets.scope);
      
      // Build scopes object
      const scopes: Record<string, { learnings: number; secrets: number }> = {};
      
      // Handle case where groupBy might not be supported in all environments
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
        scopes
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return { totalLearnings: 0, totalSecrets: 0, scopes: {} };
    }
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
      state.state.assumptions.forEach((a) => lines.push(`- ${a}`));
    }
    if (state.state.decisions?.length) {
      lines.push('Decisions:');
      state.state.decisions.forEach((d) =>
        lines.push(`- ${d.text}${d.status ? ` (${d.status})` : ''}`),
      );
    }
    if (state.state.open_questions?.length) {
      lines.push('Open questions:');
      state.state.open_questions.forEach((q) => lines.push(`- ${q}`));
    }
    if (state.state.next_actions?.length) {
      lines.push('Next actions:');
      state.state.next_actions.forEach((a) => lines.push(`- ${a}`));
    }
    if (typeof state.state.confidence === 'number') {
      lines.push(`Confidence: ${state.state.confidence}`);
    }
    return lines.join('\n');
  }

  async getState(runId: string): Promise<WorkingStateResponse | null> {
    const db = await this.initDB();
    const row = await db
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
    const db = await this.initDB();
    const now = new Date().toISOString();
    const normalized = this.normalizeWorkingStatePayload(payload);

    const existing = await this.getState(runId);
    const nextRevision = (existing?.revision ?? 0) + 1;
    const stateJson = JSON.stringify(normalized);

    if (existing) {
      await db
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
      await db.insert(schema.stateRuns).values({
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

    await db.insert(schema.stateRevisions).values({
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

  async patchState(runId: string, patch: any, updatedBy?: string): Promise<WorkingStateResponse> {
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
    const db = await this.initDB();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(schema.stateEvents).values({
      id,
      runId,
      eventType,
      payloadJson: JSON.stringify(payload ?? {}),
      createdBy,
      createdAt: now,
    } as any);
    return { success: true, id };
  }

  async resolveState(runId: string, opts: ResolveStateOptions = {}): Promise<WorkingStateResponse | null> {
    const db = await this.initDB();
    const current = await this.getState(runId);
    if (!current) return null;

    const now = new Date().toISOString();
    await db
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

  /**
   * Initialize Hono app for HTTP handling
   */
  private initApp(): Hono<{ Bindings: Env }> {
    if (this.app) return this.app;
    
    const app = new Hono<{ Bindings: Env }>();
    
    // CORS middleware
    app.use('*', cors());
    
    // Health check
    app.get('/', (c) => {
      return c.json({ status: 'ok', service: 'deja' });
    });
    
    // Learn endpoint
    app.post('/learn', async (c) => {
      const body: any = await c.req.json();
      const result = await this.learn(body.scope || 'shared', body.trigger, body.learning, body.confidence, body.reason, body.source);
      return c.json(result);
    });
    
    // Query endpoint
    app.post('/query', async (c) => {
      const body: any = await c.req.json();
      const result = await this.query(body.scopes || ['shared'], body.text, body.limit);
      return c.json(result);
    });
    
    // Inject endpoint
    app.post('/inject', async (c) => {
      const body: any = await c.req.json();
      const result = await this.inject(body.scopes || ['shared'], body.context, body.limit, body.format);

      if (body.includeState && typeof body.runId === 'string' && body.runId.trim()) {
        const state = await this.getState(body.runId.trim());
        if (state) {
          const statePrompt = this.formatStatePrompt(state);
          if (result.prompt) {
            result.prompt = `${statePrompt}\n\n${result.prompt}`;
          } else if ((body.format || 'prompt') === 'prompt') {
            result.prompt = statePrompt;
          }
          result.state = state;
        }
      }

      return c.json(result);
    });

    // Inject trace endpoint - full retrieval pipeline for debugging
    app.post('/inject/trace', async (c) => {
      const body: any = await c.req.json().catch(() => ({}));
      const thresholdParam = c.req.query('threshold');
      const threshold =
        typeof body.threshold === 'number'
          ? body.threshold
          : thresholdParam !== undefined
            ? parseFloat(thresholdParam)
            : 0;
      const result = await this.injectTrace(
        body.scopes || ['shared'],
        body.context || '',
        body.limit ?? 5,
        Number.isFinite(threshold) ? threshold : 0
      );
      return c.json(result);
    });
    
    // Stats endpoint
    app.get('/stats', async (c) => {
      const result = await this.getStats();
      return c.json(result);
    });

    // Working state endpoints
    app.get('/state/:runId', async (c) => {
      const runId = c.req.param('runId');
      const state = await this.getState(runId);
      if (!state) return c.json({ error: 'not found' }, 404);
      return c.json(state);
    });

    app.put('/state/:runId', async (c) => {
      const runId = c.req.param('runId');
      const body: any = await c.req.json();
      const state = await this.upsertState(runId, body, body.updatedBy, body.changeSummary || 'state put');
      return c.json(state);
    });

    app.patch('/state/:runId', async (c) => {
      const runId = c.req.param('runId');
      const body: any = await c.req.json();
      const state = await this.patchState(runId, body, body.updatedBy);
      return c.json(state);
    });

    app.post('/state/:runId/events', async (c) => {
      const runId = c.req.param('runId');
      const body: any = await c.req.json();
      const result = await this.addStateEvent(runId, body.eventType || 'note', body.payload || body, body.createdBy);
      return c.json(result);
    });

    app.post('/state/:runId/resolve', async (c) => {
      const runId = c.req.param('runId');
      const body: any = await c.req.json();
      const result = await this.resolveState(runId, {
        persistToLearn: Boolean(body.persistToLearn),
        scope: body.scope,
        summaryStyle: body.summaryStyle,
        updatedBy: body.updatedBy,
      });
      if (!result) return c.json({ error: 'not found' }, 404);
      return c.json(result);
    });
    
    // Get learnings endpoint
    app.get('/learnings', async (c) => {
      const scope = c.req.query('scope');
      const limit = c.req.query('limit');
      const result = await this.getLearnings({
        scope,
        limit: limit ? parseInt(limit) : undefined
      });
      return c.json(result);
    });

    app.delete('/learnings', async (c) => {
      const confidenceLt = c.req.query('confidence_lt');
      const notRecalledInDays = c.req.query('not_recalled_in_days');
      const scope = c.req.query('scope');

      const filters: { confidence_lt?: number; not_recalled_in_days?: number; scope?: string } = {};
      if (confidenceLt != null) {
        const n = parseFloat(confidenceLt);
        if (Number.isFinite(n)) filters.confidence_lt = n;
      }
      if (notRecalledInDays != null) {
        const n = parseInt(notRecalledInDays);
        if (Number.isFinite(n) && n > 0) filters.not_recalled_in_days = n;
      }
      if (scope != null && scope.trim()) filters.scope = scope.trim();

      if (Object.keys(filters).length === 0) {
        return c.json({ error: 'At least one filter required: confidence_lt, not_recalled_in_days, or scope' }, 400);
      }

      const result = await this.deleteLearnings(filters);
      return c.json(result);
    });
    
    // Delete learning endpoint
    app.delete('/learning/:id', async (c) => {
      const id = c.req.param('id');
      const result = await this.deleteLearning(id);
      return c.json(result);
    });

    app.get('/learning/:id/neighbors', async (c) => {
      const id = c.req.param('id');
      const thresholdParam = c.req.query('threshold');
      const limitParam = c.req.query('limit');
      const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.85;
      const limit = limitParam ? parseInt(limitParam) : 10;
      const result = await this.getLearningNeighbors(
        id,
        Number.isFinite(threshold) ? threshold : 0.85,
        Number.isFinite(limit) && limit > 0 ? limit : 10
      );
      return c.json(result);
    });

    // Set secret endpoint
    app.post('/secret', async (c) => {
      const body: any = await c.req.json();
      const result = await this.setSecret(body.scope || 'shared', body.name, body.value);
      return c.json(result);
    });
    
    // Get secret endpoint
    app.get('/secret/:name', async (c) => {
      const name = c.req.param('name');
      const scopes = c.req.query('scopes')?.split(',') || ['shared'];
      const result = await this.getSecret(scopes, name);
      if (result === null) {
        return c.json({ error: 'not found' }, 404);
      }
      return c.json({ value: result });
    });
    
    // Delete secret endpoint
    app.delete('/secret/:name', async (c) => {
      const name = c.req.param('name');
      const scope = c.req.query('scope') || 'shared';
      const result = await this.deleteSecret(scope, name);
      if (result.error) {
        return c.json({ error: result.error }, 404);
      }
      return c.json(result);
    });
    
    // Get secrets endpoint
    app.get('/secrets', async (c) => {
      const scope = c.req.query('scope');
      const db = await this.initDB();
      
      try {
        let query: any = db.select().from(schema.secrets);
        
        if (scope) {
          query = query.where(eq(schema.secrets.scope, scope));
        }
        
        const results = await query.orderBy(desc(schema.secrets.updatedAt));
        return c.json(results);
      } catch (error) {
        console.error('Get secrets error:', error);
        return c.json({ error: 'Failed to get secrets' }, 500);
      }
    });
    
    // Cleanup endpoint
    app.post('/cleanup', async (c) => {
      const result = await this.cleanup();
      return c.json(result);
    });
    
    // 404 handler
    app.notFound((c) => {
      return c.json({ error: 'not found' }, 404);
    });
    
    // Error handler
    app.onError((err, c) => {
      console.error('Hono error:', err);
      return c.json({ error: err.message }, 500);
    });
    
    this.app = app;
    return app;
  }

  /**
   * HTTP fetch handler using Hono
   */
  async fetch(request: Request) {
    try {
      const app = this.initApp();
      return await app.fetch(request, this.env);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
