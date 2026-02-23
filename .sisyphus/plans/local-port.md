# Port deja to fully local (no Cloudflare)

## TL;DR

> **Quick Summary**: Replace all 5 Cloudflare bindings (DurableObject, Vectorize, Workers AI, ASSETS, Cron) with local equivalents (libSQL, Transformers.js, Bun/Hono, node-cron). Collapse the Worker+DO double-dispatch into a single Hono server with a service class. Preserve every HTTP route and MCP tool exactly.
> 
> **Deliverables**:
> - Standalone Bun/Hono HTTP server replacing CF Worker entrypoint
> - libSQL for unified relational + vector storage (replaces DO SQLite + Vectorize)
> - Local embedding via @huggingface/transformers (replaces Workers AI)
> - node-cron for scheduled cleanup (replaces CF cron trigger)
> - Updated tests and package.json scripts
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2/3/4 → Task 5/6 → Task 8/9 → Task 12 → Final

---

## Context

### Original Request
Port the deja application (Cloudflare Workers-based agent memory layer for AI agents) to run fully locally with zero Cloudflare dependency. Preserve all features and API interfaces. User suggested libSQL for vector+relational storage.

### Interview Summary
**Key Discussions**:
- **Tenant model**: Single-tenant (one DB, one API key) — simplest for local/self-hosted
- **Marketing site**: Excluded — API only
- **Coexistence**: Replace in-place — CF code lives in git history
- **libSQL confirmed**: Native F32_BLOB(384) + vector_distance_cos() replaces both Vectorize and DO SQLite

**Research Findings**:
- libSQL supports native vector columns, cosine distance, and optional DiskANN indexing — no extension needed
- @huggingface/transformers runs the exact same bge-small-en-v1.5 model via ONNX locally with 384-dim output
- Drizzle ORM has a libsql driver, but vector operations require raw SQL (Drizzle has no F32_BLOB type)
- All Hono routing, MCP JSON-RPC, auth logic, and business logic in the current code are CF-agnostic

### Metis Review
**Identified Gaps** (addressed):
- **CRITICAL: Score semantics inversion** — Vectorize returns similarity (0-1, higher=better), libSQL vector_distance_cos returns distance (0-2, lower=better). Every threshold comparison and sort order must be inverted.
- **HIGH: F32_BLOB + Drizzle incompatibility** — Drizzle's db.insert() can't wrap with vector32(). All vector insert/query operations must use raw SQL via db.execute().
- **HIGH: Hard blocker validation needed** — Transformers.js in Bun, libSQL vector ops, embedding dims must be verified before any implementation.
- **MEDIUM: Double-Hono collapse** — Current index.ts proxies all requests to DO via stub.fetch(new Request('http://internal/...')). This indirection is pointless locally; collapse into direct method calls.
- **LOW: setSecret upsert pattern** — Uses result.rowsAffected which may differ in libSQL; may need INSERT ON CONFLICT.

---

## Work Objectives

### Core Objective
Replace all Cloudflare runtime dependencies with local equivalents so deja runs as a standalone Bun process with zero cloud dependency, preserving the exact API contract.

### Concrete Deliverables
- `src/index.ts` — Bun/Hono HTTP server (replaces CF Worker export)
- `src/service.ts` — Business logic class (replaces DejaDO without DurableObject base)
- `src/db.ts` — libSQL client singleton + Drizzle init + schema migration
- `src/embeddings.ts` — Transformers.js wrapper with model lifecycle
- `src/schema.ts` — Updated with F32_BLOB custom type
- `src/cleanup.ts` — node-cron scheduled cleanup
- `package.json` — Updated deps and scripts
- Updated tests

### Definition of Done
- [ ] `bun run dev` starts server on PORT (default 8787)
- [ ] All 25+ HTTP routes respond with identical JSON shapes to current CF version
- [ ] All 13 MCP tools work via POST /mcp JSON-RPC
- [ ] Learn→Inject roundtrip proves embedding+vector search works end-to-end
- [ ] `bun run test` passes
- [ ] `bun run typecheck` passes
- [ ] Zero imports from `cloudflare:workers`, `@cloudflare/*`, or `wrangler`

### Must Have
- Every HTTP route path, method, query param, request/response shape preserved
- All 13 MCP tool names, input schemas, response formats preserved
- Bearer token auth with API_KEY env var
- CORS headers (Access-Control-Allow-Origin: *)
- Scheduled cleanup (session>7d, agent>30d, confidence<0.3)
- Working state endpoints (state_runs, state_revisions, state_events)
- Secrets CRUD endpoints
- Semantic vector search with cosine similarity
- Scope priority filtering (session > agent > shared)
- Recall tracking (last_recalled_at, recall_count increment on inject)

### Must NOT Have (Guardrails)
- No Cloudflare imports or bindings anywhere in src/
- No external cloud API calls (everything runs locally)
- No multi-tenant complexity (single DB, single API key)
- No new routes, tools, or features beyond current API surface
- No Docker, PM2, dotenv, or deployment tooling
- No changes to marketing/ or packages/deja-client/
- No excessive comments, JSDoc, or documentation generation
- No premature abstraction (e.g., "provider pattern" for embeddings — just use Transformers.js)
- No changing Drizzle table/column names (only embedding column type changes)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (jest + ts-jest)
- **Automated tests**: YES (tests-after — rewrite existing mocked tests for real local stack)
- **Framework**: jest (existing) — keep it, just change what's mocked

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API verification**: Use Bash (curl) — send requests, assert status + response fields
- **DB verification**: Use Bash (bun REPL) — import client, run queries, check results
- **Type verification**: Use Bash (bun run typecheck)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — validation + foundation):
├── Task 1: Hard blocker validation [deep]
├── Task 2: libSQL database module (src/db.ts) [unspecified-high]
├── Task 3: Embedding service (src/embeddings.ts) [unspecified-high]
└── Task 4: Update schema.ts for F32_BLOB [quick]

Wave 2 (After Wave 1 — core service rewrite):
├── Task 5: Port non-vector service methods (secrets, state, stats, getLearnings) [unspecified-high]
├── Task 6: Port vector methods with score inversion (learn, inject, query, neighbors) [deep]
└── Task 7: Port cleanup to node-cron [quick]

Wave 3 (After Wave 2 — server + integration):
├── Task 8: New index.ts — Bun/Hono server with auth + all routes [deep]
├── Task 9: Port MCP handler (collapse stub.fetch indirection) [unspecified-high]
└── Task 10: Update package.json deps and scripts [quick]

Wave 4 (After Wave 3 — tests + verification):
├── Task 11: Update/rewrite tests for local stack [unspecified-high]
└── Task 12: End-to-end smoke test (full roundtrip) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 6 → Task 8 → Task 12 → Final
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3, 4, 5, 6, 7, 8, 9 |
| 2 | 1 | 5, 6, 7, 8 |
| 3 | 1 | 6, 8 |
| 4 | 1 | 2, 5, 6 |
| 5 | 2, 4 | 8, 9 |
| 6 | 2, 3, 4 | 8, 9 |
| 7 | 2, 6 | 8 |
| 8 | 5, 6, 7, 9 | 11, 12 |
| 9 | 5, 6 | 8 |
| 10 | 1 | 11, 12 |
| 11 | 8, 10 | F1-F4 |
| 12 | 8, 10 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1** (4 tasks): T1→`deep`, T2→`unspecified-high`, T3→`unspecified-high`, T4→`quick`
- **Wave 2** (3 tasks): T5→`unspecified-high`, T6→`deep`, T7→`quick`
- **Wave 3** (3 tasks): T8→`deep`, T9→`unspecified-high`, T10→`quick`
- **Wave 4** (2 tasks): T11→`unspecified-high`, T12→`deep`
- **FINAL** (4 tasks): F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [ ] 1. Hard Blocker Validation

  **What to do**:
  - Create a script `scripts/validate-blockers.ts` that tests all 3 hard blockers sequentially:
    1. Import `@huggingface/transformers`, load `onnx-community/bge-small-en-v1.5-ONNX`, generate an embedding for "hello world", assert output is Float32Array of length 384
    2. Create a libSQL client with `file:./test-validate.db`, create a table with `F32_BLOB(384)` column, insert a vector via `vector32()`, query with `vector_distance_cos()`, assert distance of identical vectors ≈ 0
    3. Generate embedding from step 1, insert into libSQL from step 2, query back, assert roundtrip works
  - Clean up test DB file after validation
  - If ANY blocker fails, print clear error message with the specific failure and exit 1

  **Must NOT do**:
  - Do not install packages yet (Task 10 handles package.json) — run with `bun add --dev` temporarily or assume deps exist
  - Do not create production code — this is a throwaway validation script

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful verification of 3 independent integrations with specific assertion logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before all other tasks)
  - **Parallel Group**: Wave 1 (but blocks everything)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/do/DejaDO.ts:171-188` — Current `createEmbedding()` method showing how AI.run is called and output consumed
  - `src/do/DejaDO.ts:340-343` — Current Vectorize.query() call showing topK, returnValues params

  **API/Type References**:
  - `src/do/DejaDO.ts:14-16` — Env interface showing VectorizeIndex and Ai types to replace

  **External References**:
  - `@huggingface/transformers` pipeline API: `pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX')` — produces Tensor with dims [1, 384]
  - libSQL vector API: `vector32()` function wraps JSON array string → F32_BLOB; `vector_distance_cos(col, vector32(?))` returns float distance 0-2
  - `@libsql/client` createClient: `createClient({ url: 'file:./path.db' })`

  **WHY Each Reference Matters**:
  - DejaDO.ts:171-188 shows the exact model name and how response.data[0] is extracted — the Transformers.js equivalent must return an array-like of 384 floats
  - The libSQL vector API uses different function names than Vectorize — vector32() for encoding, vector_distance_cos() for search

  **Acceptance Criteria**:
  - [ ] Script runs with `bun run scripts/validate-blockers.ts` and exits 0
  - [ ] Output confirms: Transformers.js loaded, embedding dims=384, libSQL vector ops work, roundtrip OK

  **QA Scenarios:**

  ```
  Scenario: All 3 blockers pass
    Tool: Bash
    Preconditions: @huggingface/transformers and @libsql/client installed
    Steps:
      1. Run `bun run scripts/validate-blockers.ts`
      2. Check exit code is 0
      3. Check stdout contains "384" (dimension confirmation)
      4. Check stdout contains distance value ≈ 0 for identical vectors
    Expected Result: Exit 0 with all 3 validations passing
    Failure Indicators: Non-zero exit code, ONNX binding error, F32_BLOB SQL error
    Evidence: .sisyphus/evidence/task-1-blockers.txt

  Scenario: Embedding produces correct dimensions
    Tool: Bash
    Preconditions: Transformers.js installed
    Steps:
      1. In validation script, log `embedding.dims` or `.length`
      2. Assert value is exactly 384
    Expected Result: 384-dimensional Float32Array
    Failure Indicators: Different dimension count, undefined dims
    Evidence: .sisyphus/evidence/task-1-embedding-dims.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `chore: add hard blocker validation script`
  - Files: `scripts/validate-blockers.ts`

- [ ] 2. libSQL Database Module (src/db.ts)

  **What to do**:
  - Create `src/db.ts` that exports:
    1. `getDb()` — returns a singleton `@libsql/client` Client connected to `file:${DB_PATH}` (env var, default `./data/deja.db`)
    2. `getDrizzle()` — returns Drizzle instance using `drizzle-orm/libsql` driver wrapping the client
    3. `initDb()` — runs all schema DDL (CREATE TABLE IF NOT EXISTS for all 5 tables + indexes), matching current DejaDO constructor DDL at `DejaDO.ts:113-148`. Add the new `embedding F32_BLOB(384)` column instead of `embedding TEXT`.
    4. Ensure `./data/` directory is created if it doesn't exist (use `fs.mkdirSync` with recursive)
  - DDL must include ALL tables: learnings, secrets, state_runs, state_revisions, state_events
  - DDL must include ALL indexes from current code: idx_learnings_trigger, idx_learnings_confidence, idx_learnings_created_at, idx_learnings_scope, idx_learnings_last_recalled_at, idx_secrets_scope
  - Include the ALTER TABLE migrations for last_recalled_at and recall_count (wrapped in try/catch like current code)

  **Must NOT do**:
  - Do not create DiskANN vector index (not needed at deja's scale)
  - Do not add connection pooling or caching
  - Do not add migration framework — keep raw DDL like the current code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Database initialization with multiple DDL statements, error handling, and singleton pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4 in Wave 1, after Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5, 6, 7, 8
  - **Blocked By**: Task 1, Task 4 (needs updated schema)

  **References**:

  **Pattern References**:
  - `src/do/DejaDO.ts:110-150` — Current constructor DDL with blockConcurrencyWhile, all CREATE TABLE/INDEX statements, ALTER TABLE migrations
  - `src/do/DejaDO.ts:155-166` — Current initDB() showing Drizzle initialization with durable-sqlite driver

  **API/Type References**:
  - `src/schema.ts:1-56` — Full Drizzle schema (5 tables) — DDL must create tables matching these column names exactly

  **External References**:
  - `@libsql/client` createClient API: `createClient({ url: 'file:./data/deja.db' })` — returns Client with .execute(), .batch(), .transaction()
  - `drizzle-orm/libsql` driver: `drizzle(client, { schema })` — wraps @libsql/client for typed queries

  **WHY Each Reference Matters**:
  - DejaDO.ts:110-150 contains the EXACT DDL that must be replicated — missing a table or index breaks queries
  - schema.ts defines the Drizzle types that service.ts will import for typed queries

  **Acceptance Criteria**:
  - [ ] `getDb()` returns a working libSQL client connected to file DB
  - [ ] `getDrizzle()` returns Drizzle instance wrapping the client
  - [ ] `initDb()` creates all 5 tables and all indexes without error
  - [ ] Calling `initDb()` twice is idempotent (CREATE TABLE IF NOT EXISTS)
  - [ ] Embedding column is `F32_BLOB(384)` not `TEXT`

  **QA Scenarios:**

  ```
  Scenario: DB initializes and tables exist
    Tool: Bash (bun)
    Preconditions: @libsql/client installed
    Steps:
      1. Run `bun -e "import { initDb, getDb } from './src/db'; await initDb(); const r = await getDb().execute('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name'); console.log(r.rows.map(r=>r.name).join(',')); process.exit(0)"`
      2. Assert output contains: learnings, secrets, state_events, state_revisions, state_runs
    Expected Result: All 5 table names listed
    Failure Indicators: Missing table, SQL error on init
    Evidence: .sisyphus/evidence/task-2-db-init.txt

  Scenario: Embedding column is F32_BLOB
    Tool: Bash (bun)
    Preconditions: DB initialized
    Steps:
      1. Run `bun -e "import { initDb, getDb } from './src/db'; await initDb(); const r = await getDb().execute('PRAGMA table_info(learnings)'); const emb = r.rows.find(r=>r.name==='embedding'); console.log(emb.type); process.exit(0)"`
      2. Assert output contains F32_BLOB
    Expected Result: Column type is F32_BLOB(384)
    Failure Indicators: Type is TEXT or missing
    Evidence: .sisyphus/evidence/task-2-f32blob.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `refactor(db): create libSQL database module with vector support`
  - Files: `src/db.ts`

- [ ] 3. Embedding Service (src/embeddings.ts)

  **What to do**:
  - Create `src/embeddings.ts` that exports:
    1. `initEmbeddings()` — loads the ONNX model pipeline (call at server startup, before first request). Uses `pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX')` from `@huggingface/transformers`.
    2. `createEmbedding(text: string): Promise<number[]>` — generates a 384-dim embedding from text. Calls the pipeline with `{ pooling: 'cls', normalize: true }`, extracts the float array, returns as `number[]`.
  - Log model loading progress: `console.log('Loading embedding model...')` on init, `console.log('Embedding model loaded')` on completion
  - Model is cached to `~/.cache/huggingface` automatically by Transformers.js after first download
  - The function signature must match the current `createEmbedding` in DejaDO.ts:171-188 — takes a string, returns `Promise<number[]>`

  **Must NOT do**:
  - Do not add provider abstraction (no "EmbeddingProvider" interface)
  - Do not add batch embedding support (current code embeds one text at a time)
  - Do not add model configuration options — hardcode the model name

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: ML model integration with specific initialization lifecycle
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4 in Wave 1, after Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/do/DejaDO.ts:171-188` — Current `createEmbedding()` method — shows input (text string), output (number[]), error handling pattern (try/catch, console.error, throw)

  **External References**:
  - `@huggingface/transformers` feature-extraction pipeline: `pipeline('feature-extraction', modelName)` returns an async function that takes string/string[] and returns Tensor
  - ONNX model: `onnx-community/bge-small-en-v1.5-ONNX` — produces dims [1, 384] with cls pooling + normalize

  **WHY Each Reference Matters**:
  - DejaDO.ts:171-188 shows the exact API contract (text → number[]) that all consumers expect
  - The Transformers.js pipeline returns a Tensor object, not a plain array — must convert via `.tolist()` or `Array.from(tensor.data)`

  **Acceptance Criteria**:
  - [ ] `initEmbeddings()` loads model without error
  - [ ] `createEmbedding('hello world')` returns number[] of length 384
  - [ ] Embeddings are normalized (L2 norm ≈ 1.0)
  - [ ] Two similar texts produce lower cosine distance than dissimilar texts

  **QA Scenarios:**

  ```
  Scenario: Embedding model loads and produces 384-dim output
    Tool: Bash (bun)
    Preconditions: @huggingface/transformers installed
    Steps:
      1. Run `bun -e "import { initEmbeddings, createEmbedding } from './src/embeddings'; await initEmbeddings(); const e = await createEmbedding('hello world'); console.log(e.length); process.exit(0)"`
      2. Assert output is exactly "384"
    Expected Result: 384
    Failure Indicators: Different number, ONNX error, model download failure
    Evidence: .sisyphus/evidence/task-3-embedding-dims.txt

  Scenario: Similar texts produce similar embeddings
    Tool: Bash (bun)
    Preconditions: Embedding service initialized
    Steps:
      1. Generate embeddings for "deploying to production" and "shipping code to prod"
      2. Generate embedding for "cooking pasta for dinner"
      3. Compute cosine distance between first two vs first and third
      4. Assert dist(deploy, ship) < dist(deploy, cooking)
    Expected Result: Related texts are closer in embedding space
    Failure Indicators: Unrelated texts are closer than related texts
    Evidence: .sisyphus/evidence/task-3-semantic-similarity.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(embeddings): add local Transformers.js embedding service`
  - Files: `src/embeddings.ts`

- [ ] 4. Update schema.ts for F32_BLOB

  **What to do**:
  - Change the `embedding` column in the `learnings` table from `text('embedding')` to a custom column type that represents `F32_BLOB(384)` in DDL
  - Since Drizzle has no built-in F32_BLOB type, use `customType` from `drizzle-orm/sqlite-core` to define a custom `f32Blob` type that serializes as `F32_BLOB(384)` in SQL
  - The custom type should accept `number[] | null` in TypeScript and map to the raw blob column in SQLite
  - Note: the Drizzle schema is used for typed SELECT queries only — INSERT with vector data uses raw SQL (Task 6 handles this)
  - All other tables and columns remain UNCHANGED

  **Must NOT do**:
  - Do not rename any tables or columns
  - Do not add new columns or tables
  - Do not remove any existing imports that other files depend on

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, small change — just swapping one column type definition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3 in Wave 1, after Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/schema.ts:11` — Current `embedding: text('embedding')` line that must change
  - `src/schema.ts:1` — Current imports from `drizzle-orm/sqlite-core`

  **External References**:
  - Drizzle `customType` API: `import { customType } from 'drizzle-orm/sqlite-core'` — allows defining custom column types with `dataType()` returning SQL type string
  - libSQL F32_BLOB: column DDL is `embedding F32_BLOB(384)` — stores 384 × 4 bytes as a blob

  **WHY Each Reference Matters**:
  - schema.ts:11 is the exact line to replace — the embedding column definition
  - The customType API is the Drizzle escape hatch for column types it doesn't natively support

  **Acceptance Criteria**:
  - [ ] `embedding` column in learnings table is defined with a custom type producing `F32_BLOB(384)` DDL
  - [ ] All other columns/tables in schema.ts are unchanged
  - [ ] TypeScript compiles without errors: `bun run typecheck` (may have errors elsewhere, but schema.ts itself must be clean)

  **QA Scenarios:**

  ```
  Scenario: Schema defines F32_BLOB type
    Tool: Bash
    Preconditions: schema.ts edited
    Steps:
      1. Run `grep -n 'F32_BLOB\|f32Blob\|customType' src/schema.ts`
      2. Assert output shows the custom type definition and its usage on the embedding column
      3. Run `grep -c 'text.*embedding' src/schema.ts` — should be 0 (old TEXT type removed)
    Expected Result: F32_BLOB custom type present, TEXT embedding gone
    Failure Indicators: Still using text('embedding'), customType not imported
    Evidence: .sisyphus/evidence/task-4-schema-type.txt

  Scenario: Other tables unchanged
    Tool: Bash
    Preconditions: schema.ts edited
    Steps:
      1. Run `grep -c 'sqliteTable' src/schema.ts`
      2. Assert count is still 5 (learnings, secrets, stateRuns, stateRevisions, stateEvents)
    Expected Result: 5 table definitions
    Failure Indicators: More or fewer tables
    Evidence: .sisyphus/evidence/task-4-tables-count.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `refactor(schema): change embedding column to F32_BLOB(384) custom type`
  - Files: `src/schema.ts`

- [ ] 5. Port Non-Vector Service Methods (src/service.ts — part 1)

  **What to do**:
  - Create `src/service.ts` with a `DejaService` class (plain class, NOT extending DurableObject)
  - Constructor takes `db` (libSQL Client) and `drizzle` instance as parameters
  - Port these methods from `DejaDO` with ZERO logic changes:
    - `filterScopesByPriority(scopes)` — private, pure logic, copy as-is
    - `convertDbLearning(dbLearning)` — adapt: embedding is now raw blob, not JSON string
    - `getLearnings(filter?)` — Drizzle only
    - `deleteLearning(id)` — remove VECTORIZE.deleteByIds() (vectors in same table)
    - `deleteLearnings(filters)` — remove VECTORIZE.deleteByIds()
    - `getSecret/setSecret/deleteSecret` — Drizzle only. setSecret: use INSERT ON CONFLICT DO UPDATE instead of update-then-check-rowsAffected
    - `getStats()` — Drizzle only
    - `normalizeWorkingStatePayload/formatStatePrompt` — pure logic, copy as-is
    - `getState/upsertState/patchState/addStateEvent/resolveState` — Drizzle only
    - `cleanup()` — remove VECTORIZE.deleteByIds() calls
  - Export all TS interfaces (Learning, Secret, Stats, QueryResult, InjectResult, InjectTraceResult, WorkingStatePayload, WorkingStateResponse, ResolveStateOptions)
  - Declare `learn()` method stub for Task 6 to implement

  **Must NOT do**:
  - Do not port vector methods (learn, inject, injectTrace, query, getLearningNeighbors) — Task 6
  - Do not change business logic, method signatures, or add abstractions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many methods with subtle adaptations (embedding parsing, VECTORIZE removal, upsert pattern)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 2, 4

  **References**:

  **Pattern References**:
  - `src/do/DejaDO.ts:194-207` — filterScopesByPriority, copy as-is
  - `src/do/DejaDO.ts:212-226` — convertDbLearning, adapt embedding parsing
  - `src/do/DejaDO.ts:232-312` — cleanup(), remove VECTORIZE.deleteByIds at lines 261, 287, 304
  - `src/do/DejaDO.ts:658-738` — getLearnings, deleteLearning, deleteLearnings
  - `src/do/DejaDO.ts:746-835` — secrets methods (setSecret line 797: rowsAffected → upsert)
  - `src/do/DejaDO.ts:841-890` — getStats
  - `src/do/DejaDO.ts:892-1101` — working state methods
  - `src/do/DejaDO.ts:20-104` — TypeScript interfaces

  **API/Type References**:
  - `src/schema.ts` — all 5 table schemas
  - `src/db.ts` — getDb() and getDrizzle() from Task 2

  **WHY Each Reference Matters**:
  - Each line range is the exact source to port
  - VECTORIZE.deleteByIds() at lines 261, 287, 304, 693, 736 must be REMOVED
  - rowsAffected at line 797 may differ in libSQL — use INSERT ON CONFLICT

  **Acceptance Criteria**:
  - [ ] `src/service.ts` exports DejaService with all listed methods + interfaces
  - [ ] No imports from `cloudflare:workers` or `drizzle-orm/durable-sqlite`
  - [ ] setSecret uses INSERT ON CONFLICT pattern
  - [ ] Zero VECTORIZE references

  **QA Scenarios:**

  ```
  Scenario: Service has all non-vector methods
    Tool: Bash
    Steps:
      1. Run `grep -c 'async ' src/service.ts` — assert >= 15
      2. Run `grep 'VECTORIZE\|cloudflare' src/service.ts` — assert empty
    Expected Result: All methods present, zero CF references
    Evidence: .sisyphus/evidence/task-5-service-methods.txt

  Scenario: No Cloudflare imports
    Tool: Bash
    Steps:
      1. Run `grep -n 'cloudflare\|DurableObject\|VECTORIZE' src/service.ts`
      2. Assert no output
    Expected Result: Zero Cloudflare references
    Evidence: .sisyphus/evidence/task-5-no-cf.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `refactor(service): port non-vector methods from DejaDO to plain DejaService`
  - Files: `src/service.ts`

- [ ] 6. Port Vector Methods with Score Inversion (src/service.ts — part 2)

  **What to do**:
  - Add vector-dependent methods to DejaService (created in Task 5):
    - `learn(scope, trigger, learning, confidence, reason?, source?)` — generates embedding via `createEmbedding()` from src/embeddings.ts. Inserts via RAW SQL: `INSERT INTO learnings (..., embedding, ...) VALUES (..., vector32(?), ...)` where `?` is JSON string of float array
    - `inject(scopes, context, limit, format)` — raw SQL: `SELECT *, vector_distance_cos(embedding, vector32(?)) as distance FROM learnings WHERE scope IN (?) ORDER BY distance ASC LIMIT ?`. Convert: `similarity = 1 - distance`
    - `injectTrace(scopes, context, limit, threshold)` — same vector query, returns debug info. Score = 1 - distance. passed_threshold = similarity >= threshold
    - `query(scopes, text, limit)` — raw SQL vector search, sort distance ASC, similarity in response
    - `getLearningNeighbors(id, threshold, limit)` — read embedding from learning, vector search. Filter: `(1 - distance) >= threshold`
  - Import `createEmbedding` from `./embeddings` and `getDb` from `./db`
  - ALL vector inserts/queries use `db.execute()` with `vector32()` SQL function

  **CRITICAL — Score Inversion:**
  - CF Vectorize: similarity (0-1, higher=better, 1=identical)
  - libSQL vector_distance_cos: distance (0-2, lower=better, 0=identical)
  - Conversion: `similarity = 1 - distance`
  - Sort: `ORDER BY distance ASC` (was: sort by score DESC)
  - Threshold: `(1 - distance) >= threshold`
  - API response: always return similarity values (1 - distance)

  **Must NOT do**:
  - Do not use Drizzle ORM for vector insert/query — Drizzle can't wrap with vector32()
  - Do not add ANN/DiskANN index
  - Do not change public method signatures or return types

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Score inversion is the single most critical correctness concern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/do/DejaDO.ts:507-561` — `learn()`: Drizzle insert + VECTORIZE.insert → raw SQL with vector32()
  - `src/do/DejaDO.ts:326-387` — `inject()`: VECTORIZE.query() → vector_distance_cos
  - `src/do/DejaDO.ts:392-495` — `injectTrace()`: scoreById → distance-based
  - `src/do/DejaDO.ts:595-651` — `query()`: VECTORIZE.query() + scope filtering
  - `src/do/DejaDO.ts:566-586` — `getLearningNeighbors()`: threshold filtering

  **External References**:
  - libSQL: `SELECT *, vector_distance_cos(embedding, vector32(?)) as distance FROM learnings ORDER BY distance ASC LIMIT ?`
  - libSQL: `INSERT INTO learnings (..., embedding) VALUES (..., vector32(?))` where ? = `'[0.1, 0.2, ...]'`

  **Acceptance Criteria**:
  - [ ] learn() inserts embedding via raw SQL with vector32()
  - [ ] inject() returns similarity (1 - distance)
  - [ ] query() sorts by distance ASC
  - [ ] getLearningNeighbors() filters by (1 - distance) >= threshold
  - [ ] injectTrace() returns similarity_score as 1 - distance
  - [ ] Zero VECTORIZE references, all vector queries use raw db.execute()

  **QA Scenarios:**

  ```
  Scenario: Learn stores embedding as F32_BLOB
    Tool: Bash (bun)
    Steps:
      1. Call service.learn('shared', 'test trigger', 'test learning', 0.8)
      2. Raw query: SELECT typeof(embedding) FROM learnings WHERE trigger='test trigger'
      3. Assert typeof is 'blob'
    Expected Result: Blob type stored
    Evidence: .sisyphus/evidence/task-6-learn-blob.txt

  Scenario: Inject returns similarity-ordered results
    Tool: Bash (bun)
    Steps:
      1. Store two learnings: deployment-related and cooking-related
      2. inject(['shared'], 'deploying to production', 5)
      3. Assert deployment ranks first, all scores in [0,1]
    Expected Result: Correct semantic ranking
    Evidence: .sisyphus/evidence/task-6-inject-similarity.txt

  Scenario: Score inversion correctness
    Tool: Bash (bun)
    Steps:
      1. injectTrace(['shared'], matching_context, 5, 0)
      2. Assert candidates[0].similarity_score in [0,1]
      3. Assert passed_threshold is true (threshold=0)
    Expected Result: Similarity (not distance) returned
    Evidence: .sisyphus/evidence/task-6-score-inversion.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(service): port vector methods with cosine distance-to-similarity inversion`
  - Files: `src/service.ts`

- [ ] 7. Port Cleanup to node-cron (src/cleanup.ts)

  **What to do**:
  - Rewrite `src/cleanup.ts`:
    1. Import `cron` from `node-cron`
    2. Import `DejaService` from `./service`
    3. Export `startCleanupCron(service: DejaService)` — schedules `service.cleanup()` daily at midnight UTC: `cron.schedule('0 0 * * *', callback)`
    4. Log results: `console.log('Cleanup:', result)`
  - Remove ALL Cloudflare imports and stub.fetch pattern

  **Must NOT do**:
  - Do not change cleanup logic (that's in service.ts)
  - Do not use setInterval instead of node-cron

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 2, 6

  **References**:
  - `src/cleanup.ts:1-32` — current file to replace
  - `node-cron`: `cron.schedule('0 0 * * *', async () => { ... })`

  **Acceptance Criteria**:
  - [ ] startCleanupCron exported, uses node-cron '0 0 * * *', calls service.cleanup() directly, no CF imports

  **QA Scenarios:**

  ```
  Scenario: Cron module structure
    Tool: Bash
    Steps:
      1. grep 'node-cron\|startCleanupCron\|cron.schedule' src/cleanup.ts — assert all present
      2. grep 'cloudflare\|DurableObject\|stub' src/cleanup.ts — assert empty
    Evidence: .sisyphus/evidence/task-7-cleanup-cron.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `refactor(cleanup): replace CF cron trigger with node-cron scheduler`
  - Files: `src/cleanup.ts`

- [ ] 8. New index.ts — Bun/Hono Server with Auth + All Routes + MCP Handler

  **What to do**:
  - Rewrite `src/index.ts` as standalone Bun/Hono HTTP server:
    1. Single Hono app (no DurableObject, no stub.fetch)
    2. Startup: `initDb()` → `initEmbeddings()` → create `DejaService` → `startCleanupCron(service)`
    3. Auth middleware: check Bearer token vs API_KEY env var. No API_KEY = open. 401 on fail.
    4. CORS: `Access-Control-Allow-Origin: *`, allow all needed methods/headers
    5. Health: `GET /` → `{"status":"ok","service":"deja"}`
    6. MCP: `POST /mcp` → handleMcpRequest; `GET /mcp` → server info
    7. All DO routes calling service methods directly:
       POST /learn, /query, /inject, /inject/trace | GET /stats, /learnings, /secrets
       DELETE /learnings, /learning/:id, /secret/:name | GET/DELETE /learning/:id
       GET /learning/:id/neighbors | POST /secret | GET /secret/:name
       GET/PUT/PATCH /state/:runId | POST /state/:runId/events, /state/:runId/resolve
       POST /cleanup
    8. `Bun.serve({ port: Number(process.env.PORT) || 8787, fetch: app.fetch })`
  - handleMcpToolCall: change `(stub, toolName, args)` to `(service: DejaService, toolName, args)`. Replace each stub.fetch with direct service call.
  - handleMcpRequest: change stub param to service.
  - REMOVE: DejaDO export, stub.fetch, ASSETS.fetch, hostname check, getUserIdFromApiKey, scheduled()
  - KEEP: MCP_TOOLS array, JSON-RPC handling
  - NOTE: This task subsumes Task 9 (MCP handler port) — they are the same file.

  **Must NOT do**:
  - Do not add routes beyond current API surface
  - Do not change request/response shapes
  - Do not add graceful shutdown or signal handling

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Central integration wiring db + embeddings + service + cleanup + auth + CORS + all routes + MCP
  - **Skills**: []

  **Parallelization**:
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 11, 12
  - **Blocked By**: Tasks 5, 6, 7

  **References**:

  **Pattern References**:
  - `src/index.ts:192-320` — handleMcpToolCall: each stub.fetch → service.method()
  - `src/index.ts:322-383` — handleMcpRequest: JSON-RPC handler
  - `src/index.ts:393-469` — Worker fetch/scheduled: auth, CORS, routing
  - `src/do/DejaDO.ts:1106-1345` — Route handlers (copy, change this.method → service.method)

  **API/Type References**:
  - `src/service.ts`, `src/db.ts`, `src/embeddings.ts`, `src/cleanup.ts`

  **Acceptance Criteria**:
  - [ ] Server starts on PORT 8787, GET / returns health JSON
  - [ ] Auth rejects without valid Bearer token
  - [ ] All 13 MCP tools dispatch to service methods
  - [ ] No DurableObject/stub.fetch/ASSETS/scheduled/cloudflare references

  **QA Scenarios:**

  ```
  Scenario: Server starts + health check
    Tool: Bash
    Steps:
      1. API_KEY=test bun run src/index.ts &
      2. Wait for model load, curl http://localhost:8787/
      3. Assert {"status":"ok","service":"deja"}
    Evidence: .sisyphus/evidence/task-8-health.txt

  Scenario: Auth enforcement
    Tool: Bash
    Steps:
      1. curl -w '%{http_code}' http://localhost:8787/stats → 401
      2. curl -w '%{http_code}' -H 'Authorization: Bearer test' http://localhost:8787/stats → 200
    Evidence: .sisyphus/evidence/task-8-auth.txt

  Scenario: MCP tools/list returns 13 tools
    Tool: Bash
    Steps: POST /mcp {jsonrpc:'2.0',id:1,method:'tools/list'} → assert 13 tools
    Evidence: .sisyphus/evidence/task-8-mcp-list.txt

  Scenario: No CF remnants in src/index.ts
    Tool: Bash
    Steps: grep 'DurableObject\|stub\.fetch\|ASSETS\|scheduled\|cloudflare' src/index.ts → empty
    Evidence: .sisyphus/evidence/task-8-no-cf.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `refactor(server): replace CF Worker with standalone Bun/Hono server`
  - Files: `src/index.ts`

- [ ] 9. (Merged with Task 8) Port MCP Handler

  **Note**: Conceptually separate but same file as Task 8. The executing agent should treat Tasks 8+9 as one unit. See Task 8 for full details on handleMcpToolCall rewrite.

- [ ] 10. Update package.json, Remove CF Config

  **What to do**:
  - package.json: add `@libsql/client`, `@huggingface/transformers`, `node-cron`; remove `wrangler`, `@cloudflare/workers-types`
  - Scripts: `"dev": "bun run src/index.ts"`, `"start": "bun run src/index.ts"`, remove deploy script
  - Delete: `wrangler.json`, `__mocks__/cloudflare-workers.js`, `src/do/` directory
  - tsconfig.json: remove `@cloudflare/workers-types` from types
  - `bun install`

  **Must NOT do**: Do not touch marketing/ or packages/deja-client/. No Docker/PM2/dotenv.

  **Recommended Agent Profile**: `quick`
  **Skills**: []

  **Parallelization**: Wave 3, parallel-safe | **Blocks**: 11, 12 | **Blocked By**: Task 1

  **References**: `package.json`, `wrangler.json`, `tsconfig.json`, `__mocks__/`, `src/do/`

  **Acceptance Criteria**:
  - [ ] bun install succeeds, no wrangler/@cloudflare in package.json
  - [ ] wrangler.json, __mocks__/, src/do/ deleted
  - [ ] tsconfig clean of CF types

  **QA Scenarios:**
  ```
  Scenario: Clean deps
    Tool: Bash
    Steps: grep -c 'wrangler\|@cloudflare' package.json → 0; test ! -f wrangler.json; test ! -d src/do
    Evidence: .sisyphus/evidence/task-10-deps.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `chore(deps): replace CF deps with libSQL, transformers.js, node-cron`
  - Files: `package.json`, `tsconfig.json`, deleted files

- [ ] 11. Update Tests for Local Stack

  **What to do**:
  - Rewrite `test/deja-do.test.ts` to test DejaService with real libSQL:
    1. beforeAll: initEmbeddings()
    2. beforeEach: temp DB, initDb(), create DejaService
    3. Test non-vector: getLearnings, secrets CRUD, getStats, state CRUD
    4. Test vector: learn, inject, query, neighbors
    5. Test cleanup
  - Update jest.config.js: remove cloudflare:workers mapper, miniflare env

  **Must NOT do**: Do not mock embeddings. Do not test via HTTP.

  **Recommended Agent Profile**: `unspecified-high`
  **Skills**: []

  **Parallelization**: Wave 4 (with Task 12) | **Blocks**: F1-F4 | **Blocked By**: 8, 10

  **References**: `test/deja-do.test.ts`, `jest.config.js`, `src/service.ts`, `src/db.ts`, `src/embeddings.ts`

  **Acceptance Criteria**:
  - [ ] `bun run test` passes
  - [ ] Covers: learn, inject, query, neighbors, getLearnings, delete, secrets, stats, state, cleanup
  - [ ] No cloudflare mocks

  **QA Scenarios:**
  ```
  Scenario: Tests pass
    Tool: Bash
    Steps: bun run test → exit 0
    Evidence: .sisyphus/evidence/task-11-tests.txt
  ```

  **Commit**: YES (Wave 4)
  - Message: `test: rewrite tests for local libSQL + transformers.js stack`
  - Files: `test/`, `jest.config.js`

- [ ] 12. End-to-End Smoke Test

  **What to do**:
  - Create `scripts/e2e-smoke.ts`:
    1. Start server subprocess (API_KEY=test-key PORT=9876)
    2. Poll GET / until 200
    3. Run all scenarios: health, auth(401), learn, inject(roundtrip), query, list, neighbors, stats, secrets CRUD, state CRUD+resolve, MCP tools/list+call, delete, cleanup
    4. Report pass/fail per scenario, kill server, exit 0/1

  **Must NOT do**: No external test framework. Don't leave server running.

  **Recommended Agent Profile**: `deep`
  **Skills**: []

  **Parallelization**: Wave 4 (with Task 11) | **Blocks**: F1-F4 | **Blocked By**: 8, 10

  **References**: `prd.ts` (existing smoke test pattern), all route definitions

  **Acceptance Criteria**:
  - [ ] `bun run scripts/e2e-smoke.ts` exits 0
  - [ ] All 13+ scenarios pass
  - [ ] Learn→Inject roundtrip works

  **QA Scenarios:**
  ```
  Scenario: Full E2E
    Tool: Bash
    Steps: bun run scripts/e2e-smoke.ts → exit 0
    Evidence: .sisyphus/evidence/task-12-e2e.txt

  Scenario: Learn-inject roundtrip
    Tool: Bash
    Steps:
      1. POST /learn trigger='dry-run before deploy' learning='prevents accidents'
      2. POST /inject context='deploying to production'
      3. Assert response includes dry-run learning
    Evidence: .sisyphus/evidence/task-12-roundtrip.txt
  ```

  **Commit**: YES (Wave 4)
  - Message: `test: add end-to-end smoke test`
  - Files: `scripts/e2e-smoke.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns (`cloudflare:workers`, `@cloudflare/`, `wrangler`). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run typecheck` + `bun run test`. Review all changed files for: `as any`/`@ts-ignore` (except where existing), empty catches, console.log in prod, commented-out code, unused imports. Check no AI slop: excessive comments, over-abstraction, generic names.
  Output: `Typecheck [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start server from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration: learn→inject→query→neighbors→delete flow. Test edge cases: empty state, invalid input, missing auth. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect unaccounted changes. Confirm no changes to `marketing/` or `packages/deja-client/`.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **After Wave 1**: `refactor(deps): add libSQL, transformers.js; create db and embedding modules` — src/db.ts, src/embeddings.ts, src/schema.ts, package.json
- **After Wave 2**: `refactor(core): port service layer from DurableObject to plain class` — src/service.ts, src/cleanup.ts
- **After Wave 3**: `refactor(server): replace CF Worker with Bun/Hono standalone server` — src/index.ts, package.json
- **After Wave 4**: `test: update tests for local stack` — test/, jest.config.js
- **Final cleanup**: `chore: remove CF artifacts (wrangler.json, __mocks__, deploy.yml)` — wrangler.json, __mocks__/, .github/

---

## Success Criteria

### Verification Commands
```bash
bun run dev &                    # Expected: server starts on :8787
curl http://localhost:8787/      # Expected: {"status":"ok","service":"deja"}
bun run typecheck                # Expected: exit 0
bun run test                     # Expected: all pass
grep -r "cloudflare" src/        # Expected: no results
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 25+ HTTP routes respond correctly
- [ ] All 13 MCP tools work
- [ ] Learn→Inject semantic roundtrip works
- [ ] Cleanup cron runs without errors
- [ ] Zero Cloudflare imports in src/
- [ ] deja-client and marketing/ untouched
