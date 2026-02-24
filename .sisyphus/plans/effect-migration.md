# Mnemonic → Effect Migration

## TL;DR

> **Quick Summary**: Complete rewrite of the mnemonic persistent memory service from Hono/vanilla TypeScript to a clean Effect-based architecture using @effect/platform for HTTP, @effect/sql-libsql for database, and idiomatic Effect service/layer patterns. Preserves the existing HTTP API contract exactly.
> 
> **Deliverables**:
> - All src/ files replaced with Effect-idiomatic code (~20 new files)
> - Jest → @effect/vitest migration
> - mnemonic-client package migrated to Effect HttpClient
> - Hono, node-cron, zod removed; Effect ecosystem packages added
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 7 waves
> **Critical Path**: Deps → Database Layer → LearningsRepo → MCP Handler → Server Entrypoint

---

## Context

### Original Request
Migrate the mnemonic repository to Effect and @effect/platform for HTTP server/client. Preserve existing HTTP API schema. No database migrations. Clean rewrite — delete old code. Create lightweight Effect services for external libs without Effect support. Follow patterns from sft-chain-transfer/api/src/postgres for DB interactions.

### Interview Summary
**Key Discussions**:
- Client package → Migrate to Effect HttpClient (Effect as peer dep)
- Test strategy → Tests-after (implement first, test as final wave)
- MCP endpoint → Keep as single POST /mcp with JSON-RPC dispatch in Effect

**Research Findings**:
- `@effect/sql-libsql` is official Effect package wrapping @libsql/client
- `@effect/sql-drizzle/Sqlite` bridges drizzle-orm via sqlite-proxy, patches QueryPromise to be yieldable
- `SqlClient.unsafe()` handles raw vector SQL (vector32, vector_distance_cos)
- drizzle-orm constraint: >=0.43.1 <0.50 (current 0.45.1 ✓)
- Effect has built-in `Cron.unsafeParse()` + `Schedule.cron()` — replaces node-cron
- sft-chain-transfer provides exact patterns for HttpApi/HttpApiGroup/HttpApiBuilder/security
- Service pattern: `Effect.Service` used throughout sft-chain-transfer (AppConfig, Database, Solana, etc.) — chosen over `Context.Tag` for V4 forward-compatibility (`Effect.Service` → `ServiceMap.Service` is a trivial rename; `Context.Tag` migration is more structural)
- V4 prep: skip `dependencies` option on `Effect.Service` — use explicit `Layer.provide` instead (the `dependencies` option is removed in V4)

### Metis Review
**Identified Gaps** (addressed):
- `@effect/sql-drizzle/Sqlite` uses `sqlite-proxy`, NOT `drizzle-orm/libsql` — vector ops MUST use `SqlClient.unsafe()`
- Secrets upsert `ON CONFLICT(name)` ignores scope — preserve as-is (user said no schema changes)
- Confidence default split: REST=0.5, MCP=0.8 — must preserve both
- Error swallowing on reads — preserve for backward compat (log + return empty)
- MCP 204 responses for notifications — use raw HttpServerResponse in handler
- Embedding vectors must stay as JSON.stringify(number[]) format, not Float32Array
- DDL startup (CREATE TABLE IF NOT EXISTS) must be preserved, not replaced by drizzle-kit migrate

---

## Work Objectives

### Core Objective
Replace all existing Hono/vanilla code with idiomatic Effect architecture while maintaining byte-for-byte HTTP API compatibility.

### Concrete Deliverables
- `src/` — ~20 new Effect-based source files organized by domain
- `test/` — Migrated integration tests using @effect/vitest
- `packages/mnemonic-client/` — Effect HttpClient-based client package
- Updated package.json, tsconfig.json, vitest.config.ts
- Removed: hono, node-cron, zod, jest deps; jest.config.js

### Definition of Done
- [ ] `bun run dev` starts server on configured port
- [ ] `bun run prd.ts` passes all 6 smoke gates against running server
- [ ] `bunx tsc --noEmit` exits 0
- [ ] `bun test` passes all integration tests
- [ ] `cd packages/mnemonic-client && bun run build && bun test` passes

### Must Have
- All 20+ HTTP endpoints with identical method/path/request/response contracts
- MCP JSON-RPC protocol with exact tool list and error codes
- Bearer token auth with API_KEY bypass when unset
- Vector search via libsql F32_BLOB + vector_distance_cos
- Embedding generation via HuggingFace transformers (same model, dims, pooling)
- Scheduled daily cleanup + manual POST /cleanup trigger
- Working state CRUD with revision tracking and event logging
- CORS support on all endpoints

### Must NOT Have (Guardrails)
- OpenAPI/Swagger endpoint (not in current API)
- OpenTelemetry/tracing (not in current system)
- Transaction wrappers on multi-step writes (preserve current non-atomic behavior)
- New endpoints, MCP tools, or query parameters
- Changed error behavior (swallowed errors must stay swallowed)
- Changed ID generation format (Date.now + random9 for learnings, crypto.randomUUID for state)
- Changed embedding text format ("When {trigger}, {learning}")
- Changed inject prompt format (joined by \n)
- Changed secrets ON CONFLICT(name) behavior
- Request size limits, rate limiting, or new validation
- JSDoc or documentation beyond what current code has
- Schema changes to stored state_json (keep JSON.parse, no Schema validation of stored state)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (Jest exists but being replaced)
- **Automated tests**: YES (tests-after)
- **Framework**: @effect/vitest (replacing Jest)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API endpoints**: Use Bash (curl) — Send requests, assert status + response fields
- **Server startup**: Use Bash — Start server, verify health endpoint, kill
- **Type checking**: Use Bash — `bunx tsc --noEmit`
- **Client package**: Use Bash — `bun run build` in client dir

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 5 parallel):
├── Task 1: Deps + build config [quick]
├── Task 2: AppConfig + Error types [quick]
├── Task 3: Domain models + Drizzle schema [quick]
├── Task 4: EmbeddingService [quick]
└── Task 5: Auth middleware [quick]

Wave 2 (After Wave 1 — infrastructure + API types, 2 parallel):
├── Task 6: Database layer [deep]
└── Task 7: API schemas (all groups) + Root API definition [unspecified-high]

Wave 3 (After Wave 2 — domain services + handlers, 4 parallel):
├── Task 8: Learnings: repo + handlers (depends: 4, 6, 7) [deep]
├── Task 9: Secrets: repo + handlers (depends: 6, 7) [quick]
├── Task 10: State: repo + handlers (depends: 6, 7) [unspecified-high]
└── Task 11: Cleanup + Health: service + handlers (depends: 6, 7) [quick]

Wave 4 (After Wave 3 — integration, 3 parallel):
├── Task 12: MCP handler (depends: 8, 9, 10, 11) [deep]
├── Task 13: mnemonic-client migration (depends: 7) [unspecified-high]
└── Task 14: Delete old files + service composition (depends: 8-11) [quick]

Wave 5 (After Wave 4 — server wiring, 1 task):
└── Task 15: Server composition + entrypoint (depends: 5, 7, 12, 14) [unspecified-high]

Wave 6 (After Wave 5 — testing, 2 parallel):
├── Task 16: Integration tests (depends: 15) [deep]
└── Task 17: Client tests (depends: 13, 15) [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 6 → Task 8 → Task 12 → Task 15 → Task 16 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2-7 | 1 |
| 2 | — | 5, 6, 7, 8-11 | 1 |
| 3 | — | 6, 7, 8-11 | 1 |
| 4 | — | 8 | 1 |
| 5 | — | 15 | 1 |
| 6 | 2, 3 | 8, 9, 10, 11 | 2 |
| 7 | 2, 3 | 8, 9, 10, 11, 13, 15 | 2 |
| 8 | 4, 6, 7 | 12, 14 | 3 |
| 9 | 6, 7 | 12, 14 | 3 |
| 10 | 6, 7 | 12, 14 | 3 |
| 11 | 6, 7 | 12, 14 | 3 |
| 12 | 8-11 | 15 | 4 |
| 13 | 7 | 17 | 4 |
| 14 | 8-11 | 15 | 4 |
| 15 | 5, 7, 12, 14 | 16, 17 | 5 |
| 16 | 15 | F1-F4 | 6 |
| 17 | 13, 15 | F1-F4 | 6 |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1→`quick`, T2→`quick`, T3→`quick`, T4→`quick`, T5→`quick`
- **Wave 2**: **2** — T6→`deep`, T7→`unspecified-high`
- **Wave 3**: **4** — T8→`deep`, T9→`quick`, T10→`unspecified-high`, T11→`quick`
- **Wave 4**: **3** — T12→`deep`, T13→`unspecified-high`, T14→`quick`
- **Wave 5**: **1** — T15→`unspecified-high`
- **Wave 6**: **2** — T16→`deep`, T17→`quick`
- **FINAL**: **4** — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs


- [ ] 1. Deps + Build Config

  **What to do**:
  - Edit `package.json`: Add `@effect/platform`, `@effect/platform-bun`, `@effect/sql`, `@effect/sql-libsql`, `@effect/sql-drizzle`, `@effect/vitest`, `@effect/experimental` to dependencies. Remove `hono`, `node-cron`, `zod` from dependencies. Remove `jest`, `ts-jest`, `@types/jest` from devDependencies. Keep `effect`, `drizzle-orm`, `@libsql/client`, `@huggingface/transformers`, `drizzle-kit`, `typescript`, `@effect/language-service`, `effect-solutions`, `gateproof`.
  - Update `package.json` scripts: Change `"test": "vitest"`, keep `dev`/`start`/`typecheck`/`db:generate`/`gates` unchanged.
  - Edit `tsconfig.json`: Remove `"jest"` from `types` array. Add `"exactOptionalPropertyTypes": true` and `"noUncheckedIndexedAccess": true` per Effect best practices.
  - Create `vitest.config.ts` with `import { defineConfig } from "vitest/config"` — configure `test.include: ["test/**/*.test.ts"]`, `test.globals: false`.
  - Delete `jest.config.js`.
  - Run `bun install` to verify all deps resolve.

  **Must NOT do**:
  - Do not remove `drizzle-orm`, `@libsql/client`, `@huggingface/transformers`, `drizzle-kit`
  - Do not change `drizzle.config.ts`
  - Do not modify any source files in src/ yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Package config edits, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: All subsequent tasks (2-17)
  - **Blocked By**: None

  **References**:
  - `package.json` — Current deps to add/remove
  - `tsconfig.json` — Current compiler settings
  - `jest.config.js` — File to delete
  - Run `bunx effect-solutions show project-setup tsconfig` for recommended Effect tsconfig settings

  **Acceptance Criteria**:
  - [ ] `bun install` completes without errors
  - [ ] `bunx tsc --noEmit` does not fail on tsconfig parsing (source files may have errors — that's expected)
  - [ ] `jest.config.js` no longer exists
  - [ ] `vitest.config.ts` exists

  **QA Scenarios:**
  ```
  Scenario: Dependencies install cleanly
    Tool: Bash
    Steps:
      1. Run `bun install`
      2. Check exit code is 0
      3. Verify `node_modules/@effect/platform` exists
      4. Verify `node_modules/hono` does NOT exist
    Expected Result: All Effect deps installed, old deps removed
    Evidence: .sisyphus/evidence/task-1-deps-install.txt
  ```

  **Commit**: YES
  - Message: `chore: swap deps to Effect ecosystem`
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`
  - Pre-commit: `bun install`

- [ ] 2. AppConfig + Error Types

  **What to do**:
  - Create `src/config.ts`: Define `AppConfig` as `Effect.Service` (following `sft-chain-transfer/api/src/config.ts` pattern). Read `PORT` (integer, default 8787), `API_KEY` (optional redacted string), `DB_PATH` (string, default `./data/mnemonic.db`). Use `Config.integer`, `Config.option(Config.redacted(...))`, `Config.string` with `Config.withDefault`.
  - Create `src/errors.ts`: Define all error types as `Schema.TaggedError` classes:
    - `DatabaseError` — wraps SQL failures, `{ cause: Schema.Defect }`
    - `EmbeddingError` — wraps embedding generation failures, `{ cause: Schema.Defect }`
    - `NotFoundError` — generic 404, `{ message: Schema.String }`, annotated `status: 404`
    - `Unauthorized` — auth failure, `{}`, annotated `status: 401`
    - `ValidationError` — bad input, `{ message: Schema.String }`, annotated `status: 400`
  - Run `bunx effect-solutions show config error-handling` before writing code.

  **Must NOT do**:
  - Do not create database connections or service implementations
  - Do not add OpenTelemetry config

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small type definition files, well-documented patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 5, 6, 7, 8-11
  - **Blocked By**: None

  **References**:
  - `sft-chain-transfer/api/src/config.ts` — AppConfig pattern with `Effect.Service`
  - `sft-chain-transfer/api/src/postgres/errors.ts` — TaggedError pattern
  - `sft-chain-transfer/api/src/security.ts:9-13` — Unauthorized error with HttpApiSchema.annotations
  - `src/index.ts:632-641` — Current auth logic (API_KEY from env, optional)
  - `src/index.ts:901` — Current PORT default (8787)
  - `src/db.ts:13` — Current DB_PATH default (./data/mnemonic.db)
  - Run `bunx effect-solutions show config error-handling`

  **Acceptance Criteria**:
  - [ ] `src/config.ts` exports `AppConfig` class with `port`, `apiKey`, `dbPath` fields
  - [ ] `src/errors.ts` exports all 5 error classes
  - [ ] All errors extend `Schema.TaggedError`

  **QA Scenarios:**
  ```
  Scenario: Config and error files parse without type errors
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit src/config.ts src/errors.ts` (or full project check)
      2. Verify no type errors in these two files
    Expected Result: Clean type check for config and errors
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES (groups with 1)
  - Message: `feat(infra): add AppConfig and error types`
  - Files: `src/config.ts`, `src/errors.ts`

- [ ] 3. Domain Models + Drizzle Schema

  **What to do**:
  - Create `src/domain.ts`: Define Effect Schema models for all domain types shared across the API:
    - `Learning` — id, trigger, learning, reason?, confidence, source?, scope, createdAt, lastRecalledAt?, recallCount
    - `Secret` — name, value, scope, createdAt, updatedAt
    - `WorkingStatePayload` — goal?, assumptions?, decisions?, open_questions?, next_actions?, confidence?
    - `WorkingStateResponse` — runId, revision, status, state (WorkingStatePayload), updatedBy?, createdAt, updatedAt, resolvedAt?
    - `InjectResult` — prompt, learnings: Learning[], state?: WorkingStateResponse
    - `InjectTraceResult` — full trace result shape
    - `QueryResult` — learnings: Learning[], hits: Record<string, number>
    - `Stats` — totalLearnings, totalSecrets, scopes
  - Keep `src/schema.ts`: Preserve the existing Drizzle table definitions exactly. Update only the import path if needed for `drizzle-orm` compatibility. Keep the `customType` for `F32_BLOB(384)`. Keep all 5 tables: learnings, secrets, stateRuns, stateRevisions, stateEvents.

  **Must NOT do**:
  - Do not change column names, types, or constraints in schema.ts
  - Do not add new tables or columns
  - Do not use Effect Schema for the drizzle table definitions (keep drizzle-orm types)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions, straightforward translation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Tasks 6, 7, 8-11
  - **Blocked By**: None

  **References**:
  - `src/schema.ts` — Current drizzle table definitions (PRESERVE)
  - `src/service.ts:10-94` — Current TypeScript interfaces for all domain types
  - `packages/mnemonic-client/src/index.ts:22-47` — Client-facing type shapes
  - Run `bunx effect-solutions show data-modeling`

  **Acceptance Criteria**:
  - [ ] `src/domain.ts` exports Schema models for Learning, Secret, WorkingStatePayload, WorkingStateResponse, InjectResult, InjectTraceResult, QueryResult, Stats
  - [ ] `src/schema.ts` is unchanged or has minimal import-only changes
  - [ ] Both files type-check cleanly

  **QA Scenarios:**
  ```
  Scenario: Domain models match current API response shapes
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit` on src/domain.ts and src/schema.ts
      2. Verify no type errors
    Expected Result: Clean compilation
    Evidence: .sisyphus/evidence/task-3-typecheck.txt
  ```

  **Commit**: YES (groups with 1, 2)
  - Message: `feat(infra): add domain models and preserve drizzle schema`
  - Files: `src/domain.ts`, `src/schema.ts`

- [ ] 4. EmbeddingService

  **What to do**:
  - Create `src/embeddings.ts`: Define `EmbeddingService` using `Effect.Service` with `scoped:` constructor (model loading needs scope for lifecycle):
    - Load model on layer construction via `Effect.tryPromise` wrapping `pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX', { device: 'cpu', dtype: 'fp32' })`
    - Expose `embed(text: string) => Effect.Effect<number[], EmbeddingError>` method
    - Inside `embed`: call `extractor(text, { pooling: 'cls', normalize: true })`, convert output to `Array.from(output.data as Float32Array)`
    - Use `Effect.fn("EmbeddingService.embed")` for tracing
    - Log `"Loading embedding model..."` and `"Embedding model loaded"` via `Effect.logInfo`
  - Follow the `Effect.Service` pattern from sft-chain-transfer. Use `scoped:` instead of `effect:` since model loading acquires a resource. Wire layer via explicit `Layer.provide`, NOT `dependencies` option (V4 compat).

  **Must NOT do**:
  - Do not change model name, dimensions (384), pooling (cls), or normalization (true)
  - Do not add model caching or model switching logic
  - Do not use `Effect.acquireRelease` (HuggingFace pipeline has no cleanup method)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, clear wrapping pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 8 (LearningsRepo needs embedding)
  - **Blocked By**: None

  **References**:
  - `src/embeddings.ts` — Current implementation (replace entirely)
  - Librarian finding: `Effect.Service` with `scoped:` + `Effect.tryPromise` pattern for wrapping HF pipeline
  - Run `bunx effect-solutions show services-and-layers`

  **Acceptance Criteria**:
  - [ ] `src/embeddings.ts` exports `EmbeddingService` class (extends `Effect.Service`) and its `.Default` layer
  - [ ] `embed()` returns `Effect.Effect<number[], EmbeddingError>`
  - [ ] Model params: `onnx-community/bge-small-en-v1.5-ONNX`, cpu, fp32, cls pooling, normalize true

  **QA Scenarios:**
  ```
  Scenario: EmbeddingService type-checks
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit` targeting src/embeddings.ts
      2. Verify no type errors
    Expected Result: Clean compilation
    Evidence: .sisyphus/evidence/task-4-typecheck.txt
  ```

  **Commit**: YES (groups with 1-3)
  - Message: `feat(infra): add EmbeddingService wrapping HuggingFace transformers`
  - Files: `src/embeddings.ts`

- [ ] 5. Auth Middleware

  **What to do**:
  - Create `src/security.ts`: Define auth middleware following `sft-chain-transfer/api/src/security.ts` pattern exactly:
    - Import `Unauthorized` from `src/errors.ts`
    - Define `Authorization` as `HttpApiMiddleware.Tag` with `failure: Unauthorized`, `security: { myBearer: HttpApiSecurity.bearer }`
    - Create `AuthorizationLive` as `Layer.effect(Authorization, ...)` that:
      - Reads `AppConfig` to get `apiKey` (which is `Option<Redacted<string>>`)
      - If `apiKey` is `None`, returns a handler that always succeeds (no auth required)
      - If `apiKey` is `Some`, compares bearer token using `Redacted.getEquivalence(Equivalence.string)`
      - On mismatch, fails with `new Unauthorized()`
  - **CRITICAL**: When `API_KEY` env is unset, all routes must be accessible. This is current behavior.

  **Must NOT do**:
  - Do not add role-based access control
  - Do not add rate limiting
  - Do not add API key rotation or multiple keys

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small file, exact pattern available in reference
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 15 (server wiring)
  - **Blocked By**: None (conceptually needs errors.ts but can write with expected imports)

  **References**:
  - `sft-chain-transfer/api/src/security.ts` — EXACT pattern to follow (Unauthorized error, HttpApiMiddleware.Tag, HttpApiSecurity.bearer, Redacted.getEquivalence)
  - `src/index.ts:630-641` — Current auth logic (API_KEY optional, bearer check)
  - `src/errors.ts` — Will import Unauthorized from here (Task 2)
  - `src/config.ts` — Will import AppConfig from here (Task 2)

  **Acceptance Criteria**:
  - [ ] `src/security.ts` exports `Authorization` tag and `AuthorizationLive` layer
  - [ ] When API_KEY is set, invalid bearer returns 401
  - [ ] When API_KEY is unset, all requests pass through

  **QA Scenarios:**
  ```
  Scenario: Auth middleware type-checks
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit` targeting src/security.ts
      2. Verify no type errors
    Expected Result: Clean compilation
    Evidence: .sisyphus/evidence/task-5-typecheck.txt
  ```

  **Commit**: YES (groups with 1-4)
  - Message: `feat(infra): add bearer auth middleware`
  - Files: `src/security.ts`

- [ ] 6. Database Layer

  **What to do**:
  - Create `src/database.ts`: Define the database layer following `/home/chase/sft-chain-transfer/api/src/postgres/database.ts` pattern:
    - Define a `Database` class using `Effect.Service` pattern: `class Database extends Effect.Service<Database>()('Database', { effect: Effect.gen(function*() { ... }) }) {}`
    - Inside the `effect:` generator:
      1. Yield `AppConfig` to get `dbPath`
      2. Create `./data` directory via `mkdirSync('./data', { recursive: true })`
      3. Yield `SqlClient.SqlClient` (provided by LibsqlClient layer below)
      4. Yield `SqliteDrizzle` (provided by SqliteDrizzle layer below)
      5. Run DDL initialization via `SqlClient.unsafe()` for all CREATE TABLE IF NOT EXISTS + CREATE INDEX + ALTER TABLE statements from current `src/db.ts` (lines 27-105)
         - Execute idempotent ALTER TABLE migrations (ADD COLUMN with try/catch becomes Effect.catchAll/ignore)
      6. Return `{ sql, drizzle }` as the service value (or simply use `Database` as a tag that signals DB is ready)
    - Define `Database.Default` layer composition: `Database.Default.pipe(Layer.provide(LibsqlClient.layer({ url: ... })), Layer.provide(SqliteDrizzle.layer({ schema })), Layer.provide(AppConfig.Default))`
    - Alternatively, define a static `layer` property on the `Database` class that wires these dependencies
    - **NOTE**: Unlike the sft-chain-transfer reference, do NOT use `dependencies` option on `Effect.Service` — use explicit `Layer.provide` for V4 compatibility
  - **CRITICAL**: DDL must run BEFORE any service queries. The `Effect.Service` `effect:` generator runs on layer construction, ensuring DDL is complete before downstream services access the DB.
  - **CRITICAL**: The `LibsqlClient` tag from `@effect/sql-libsql` provides `SqlClient` which has `unsafe()` method. This is what repos use for vector queries.
  - Export `Database` class (which exposes `.Default` layer) and re-export `SqliteDrizzle` / `SqlClient` types for downstream use. Downstream repos should `yield* SqlClient.SqlClient` and `yield* SqliteDrizzle` directly — the `Database` service is primarily a setup/DDL service.

  **Must NOT do**:
  - Do not use drizzle-kit migrate or drizzle push - use CREATE TABLE IF NOT EXISTS + ALTER TABLE (current behavior)
  - Do not add transaction wrappers
  - Do not change any table definitions
  - Do not add connection pooling or retry logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Layer composition with Effect.tap for DDL sequencing requires careful understanding of Effect layer mechanics
  - **Skills**: []
  - Run `bunx effect-solutions show services-and-layers` before writing code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 7)
  - **Blocks**: Tasks 8, 9, 10, 11 (all repos need DB access)
  - **Blocked By**: Tasks 2 (AppConfig), 3 (schema.ts)

  **References**:

  **Pattern References**:
  - `/home/chase/sft-chain-transfer/api/src/postgres/database.ts` - Database layer pattern (Layer construction, SqlClient provision)
  - `/home/chase/sft-chain-transfer/api/src/service.ts` - How database layers are composed into service layers

  **API/Type References**:
  - `src/schema.ts` - Drizzle schema tables to pass to SqliteDrizzle.layer()
  - `src/db.ts:24-115` - All DDL statements (CREATE TABLE, CREATE INDEX, ALTER TABLE) to replicate exactly
  - `src/config.ts` - AppConfig.dbPath for database URL construction

  **External References**:
  - `@effect/sql-libsql` source: `ai/.reference/effect/packages/sql-libsql/src/LibsqlClient.ts` - LibsqlClient.layer() API
  - `@effect/sql-drizzle` source: `ai/.reference/effect/packages/sql-drizzle/src/Sqlite.ts` - SqliteDrizzle.layer() API
  - Run `bunx effect-solutions show services-and-layers`

  **WHY Each Reference Matters**:
  - sft-chain-transfer database.ts: Shows the canonical pattern for constructing DB layers in this codebase's style
  - db.ts DDL: These exact statements must be replicated. Missing an index or ALTER TABLE breaks backward compat
  - LibsqlClient source: Need to understand exact layer constructor signature and what tags it provides

  **Acceptance Criteria**:
  - [ ] `src/database.ts` exports `Database` class using `extends Effect.Service<Database>()('Database', { effect: ... })` pattern
  - [ ] `Database.Default` layer (or static `layer` property) provides `LibsqlClient`, `SqliteDrizzle`, and `Database` tags
  - [ ] DDL runs on layer construction (all 5 CREATE TABLE + 6 CREATE INDEX + 2 ALTER TABLE)
  - [ ] Does NOT use `dependencies` option on `Effect.Service` (uses explicit `Layer.provide` instead)
  - [ ] `bunx tsc --noEmit` passes for database.ts

  **QA Scenarios:**
  ```
  Scenario: Database layer type-checks and DDL structure is correct
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Verify src/database.ts compiles without errors
      3. Grep src/database.ts for 'CREATE TABLE IF NOT EXISTS learnings' to confirm DDL present
      4. Grep src/database.ts for 'CREATE TABLE IF NOT EXISTS secrets' 
      5. Grep src/database.ts for 'CREATE TABLE IF NOT EXISTS state_runs'
      6. Grep src/database.ts for 'ALTER TABLE learnings ADD COLUMN last_recalled_at'
    Expected Result: Type-check clean, all 5 CREATE TABLE statements present, both ALTER TABLEs present
    Evidence: .sisyphus/evidence/task-6-typecheck.txt

  Scenario: Database layer does not use drizzle-kit migrate
    Tool: Bash
    Steps:
      1. Search src/database.ts for 'migrate' or 'drizzle-kit'
    Expected Result: No matches found
    Evidence: .sisyphus/evidence/task-6-no-migrate.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): add database layer with DDL initialization`
  - Files: `src/database.ts`

- [ ] 7. API Schemas + Root API Definition

  **What to do**:
  - Create API schema files for each domain group following the HttpApiGroup/HttpApiEndpoint pattern from sft-chain-transfer:
  - **`src/learnings/api.ts`**: Define `LearningsApi` HttpApiGroup with all learning endpoints:
    - `POST /learn` - body: `{ trigger, learning, confidence?, scope?, reason?, source? }`, response: `Learning`
    - `POST /inject` - body: `{ context, scopes?, limit?, format?, includeState?, runId? }`, response: `InjectResult`
    - `POST /inject/trace` - body: `{ context, scopes?, limit?, threshold? }` + query param `threshold?`, response: `InjectTraceResult`
    - `POST /query` - body: `{ text, scopes?, limit? }`, response: `QueryResult`
    - `GET /learnings` - query: `{ scope?, limit? }`, response: `Learning[]`
    - `DELETE /learnings` - query: `{ confidence_lt?, not_recalled_in_days?, scope? }`, response: `{ deleted, ids }`
    - `DELETE /learning/:id` - path param `id`, response: `{ success, error? }`
    - `GET /learning/:id/neighbors` - path param `id`, query: `{ threshold?, limit? }`, response: `Array<Learning & { similarity_score }>`
    - `GET /stats` - no params, response: `Stats`
  - **`src/secrets/api.ts`**: Define `SecretsApi` HttpApiGroup:
    - `POST /secret` - body: `{ name, value, scope? }`, response: `{ success, error? }`
    - `GET /secret/:name` - path param `name`, query: `{ scopes? }`, response: `{ value }` or 404
    - `DELETE /secret/:name` - path param `name`, query: `{ scope? }`, response: `{ success, error? }`
    - `GET /secrets` - query: `{ scope? }`, response: `Secret[]`
  - **`src/state/api.ts`**: Define `StateApi` HttpApiGroup:
    - `GET /state/:runId` - response: `WorkingStateResponse` or 404
    - `PUT /state/:runId` - body: `WorkingStatePayload + { updatedBy?, changeSummary? }`, response: `WorkingStateResponse`
    - `PATCH /state/:runId` - body: partial payload + `{ updatedBy? }`, response: `WorkingStateResponse`
    - `POST /state/:runId/events` - body: `{ eventType?, payload?, createdBy? }`, response: `{ success, id }`
    - `POST /state/:runId/resolve` - body: `{ persistToLearn?, scope?, summaryStyle?, updatedBy? }`, response: `WorkingStateResponse` or 404
  - **`src/health/api.ts`**: Define `HealthApi` HttpApiGroup:
    - `GET /` - response: `{ status: 'ok', service: 'mnemonic' }` - **NO AUTH** (exempt from middleware)
    - `POST /cleanup` - response: `{ deleted, reasons }`
  - **`src/mcp/api.ts`**: Define `McpApi` HttpApiGroup:
    - `POST /mcp` - body: raw JSON (JSON-RPC), response: raw JSON
    - `GET /mcp` - response: `{ name, version, description, protocol, endpoint, tools }`
  - **`src/api.ts`**: Create root `Api` by composing all groups: `HttpApi.make('mnemonic').add(LearningsApi).add(SecretsApi).add(StateApi).add(HealthApi).add(McpApi)`
  - **CRITICAL**: Import domain types from `src/domain.ts` for all request/response schemas.
  - **CRITICAL**: For `POST /mcp`, the body/response cannot be fully typed with Effect Schema (it's JSON-RPC with dynamic dispatch). Use `Schema.Unknown` or `Schema.JsonFromSelf` for body/response, and handle typing inside the handler.
  - **CRITICAL**: `GET /` must NOT have the `Authorization` middleware. Define the health group WITHOUT middleware and apply middleware to the other groups via `.middleware(Authorization)` at group level.
  - For path params, use `HttpApiSchema.param('id', Schema.String)` or `.setPath(Schema.Struct({ id: Schema.String }))` pattern.
  - For query params on GET/DELETE, use `.setUrlParams(Schema.Struct({...}))` with optional fields.
  - All endpoints except `GET /` require `Authorization` middleware. Apply at group level for learnings, secrets, state, mcp groups. Health group: only `POST /cleanup` needs auth, `GET /` is exempt. Consider splitting health into two groups or applying auth per-endpoint.

  **Must NOT do**:
  - Do not add OpenAPI/Swagger annotations or endpoints
  - Do not add new endpoints not in current API
  - Do not add request body size limits or new validation rules beyond what current code does
  - Do not validate stored state_json with Schema (keep JSON.parse passthrough)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many files with careful schema translation but not algorithmically deep
  - **Skills**: []
  - Run `bunx effect-solutions show data-modeling` before writing code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Tasks 8, 9, 10, 11, 13, 15 (handlers need API types; client needs API types; server needs root API)
  - **Blocked By**: Tasks 2 (error types), 3 (domain models)

  **References**:

  **Pattern References**:
  - `/home/chase/sft-chain-transfer/api/src/wallet/wallet.api.ts` - HttpApiGroup + HttpApiEndpoint pattern with path params and multiple methods
  - `/home/chase/sft-chain-transfer/api/src/health/health.api.ts` - Simple health endpoint pattern (exempt from auth)
  - `/home/chase/sft-chain-transfer/api/src/api.ts` - Root HttpApi composition (combining groups)

  **API/Type References**:
  - `src/domain.ts` - All Schema types for request/response bodies (Learning, InjectResult, etc.)
  - `src/errors.ts` - Error types for endpoint `.addError()` annotations
  - `src/security.ts` - Authorization middleware tag for `.middleware(Authorization)`

  **Source-of-Truth References** (current HTTP contract to match exactly):
  - `src/index.ts:654-664` - POST /learn: body shape, defaults (confidence undefined, scope 'shared')
  - `src/index.ts:667-674` - POST /query: body uses `text` not `query` as field name
  - `src/index.ts:677-693` - POST /inject: format field, includeState, runId
  - `src/index.ts:696-711` - POST /inject/trace: threshold from body OR query param
  - `src/index.ts:714` - GET /stats: no params
  - `src/index.ts:716-723` - GET /learnings: scope + limit as query params
  - `src/index.ts:726-753` - DELETE /learnings: query params with 400 when no filters
  - `src/index.ts:755-771` - DELETE /learning/:id, GET /learning/:id/neighbors
  - `src/index.ts:774-813` - All secret endpoints
  - `src/index.ts:816-870` - All state endpoints
  - `src/index.ts:877-890` - MCP endpoints (POST + GET)
  - `src/index.ts:652` - GET /: health (exempt from auth)
  - `src/index.ts:892` - notFound handler: `{ error: 'not found' }` 404

  **WHY Each Reference Matters**:
  - wallet.api.ts: Most complete example of multi-endpoint group with path params and mixed methods
  - health.api.ts: Shows how to create auth-exempt groups
  - api.ts: Shows the exact root composition pattern we must follow
  - index.ts line references: GROUND TRUTH for each endpoint's exact contract (body fields, query params, defaults, error responses)

  **Acceptance Criteria**:
  - [ ] All 5 api.ts files exist: learnings, secrets, state, health, mcp
  - [ ] `src/api.ts` root API composes all 5 groups
  - [ ] Every endpoint from current index.ts has a corresponding HttpApiEndpoint definition
  - [ ] `GET /` is exempt from Authorization middleware
  - [ ] `POST /mcp` body/response uses Schema.Unknown or similar (not fully typed)
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: All API schema files type-check
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Verify all api.ts files compile
    Expected Result: Clean type check
    Evidence: .sisyphus/evidence/task-7-typecheck.txt

  Scenario: Root API includes all groups
    Tool: Bash
    Steps:
      1. Read src/api.ts and verify it imports and .add()s all 5 groups
      2. Grep for 'LearningsApi', 'SecretsApi', 'StateApi', 'HealthApi', 'McpApi' in src/api.ts
    Expected Result: All 5 groups present in root API
    Evidence: .sisyphus/evidence/task-7-root-api.txt

  Scenario: Endpoint count matches current API
    Tool: Bash
    Steps:
      1. Count total HttpApiEndpoint definitions across all api.ts files
      2. Compare to known count: 20+ endpoints
    Expected Result: >=20 endpoint definitions
    Evidence: .sisyphus/evidence/task-7-endpoint-count.txt
  ```

  **Commit**: YES
  - Message: `feat(api): define all HTTP API schemas and root API composition`
  - Files: `src/api.ts`, `src/learnings/api.ts`, `src/secrets/api.ts`, `src/state/api.ts`, `src/health/api.ts`, `src/mcp/api.ts`

- [ ] 8. Learnings Repository + Handlers

  **What to do**:
  - Create `src/learnings/repo.ts`: Define `LearningsRepo` using `Effect.Service` pattern (matching sft-chain-transfer) with methods:
    - `learn(scope, trigger, learning, confidence?, reason?, source?) => Effect<Learning, DatabaseError | EmbeddingError>`
      - Generate ID: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      - Build embedding text: `When ${trigger}, ${learning}`
      - Call `EmbeddingService.embed(text)` for vector
      - Insert via `SqlClient.unsafe()`: `INSERT INTO learnings (..., embedding, ...) VALUES (..., vector32(?), ...)` with `JSON.stringify(embedding)` for the vector arg
      - Default confidence = 0.5 for REST (callers pass this), 0.8 for MCP (MCP handler passes this)
    - `inject(scopes, context, limit?, format?) => Effect<InjectResult, DatabaseError | EmbeddingError>`
      - Call `filterScopesByPriority(scopes)` first - return empty if no scopes
      - Vector search via `SqlClient.unsafe()`: SELECT with `vector_distance_cos(embedding, vector32(?))` ORDER BY distance ASC LIMIT ?
      - Convert similarity: `1 - Number(row.distance ?? 0)`, filter `Number.isFinite`
      - Update recall tracking: `lastRecalledAt = now`, `recallCount = COALESCE(recall_count, 0) + 1` via drizzle update with `inArray`
      - If format='prompt': join as `When ${trigger}, ${learning}` with `\n`
      - **Error handling**: try/catch equivalent via `Effect.catchAll` - log error + return `{ prompt: '', learnings: [] }` (swallow errors)
    - `injectTrace(scopes, context, limit?, threshold?) => Effect<InjectTraceResult, DatabaseError | EmbeddingError>`
      - Like inject but fetches `Math.max(limit * 3, 20)` candidates
      - Returns all candidates with similarity_score and passed_threshold flag
      - Sorts by similarity DESC
      - Injected = candidates that passed threshold, sliced to limit
      - **Error handling**: swallow errors - return empty result with duration_ms
    - `query(scopes, text, limit?) => Effect<QueryResult, DatabaseError | EmbeddingError>`
      - Vector search, build `hits` record (scope -> count), swallow errors
    - `getLearningNeighbors(id, threshold?, limit?) => Effect<Array<Learning & { similarity_score }>, DatabaseError>`
      - Self-join vector query: `vector_distance_cos(l2.embedding, l1.embedding)` WHERE l1.id=? AND l2.id!=?
      - candidateLimit = `Math.max(limit * 3, 20)`, filter by threshold, slice to limit
    - `getLearnings(filter?) => Effect<Learning[], DatabaseError>` - drizzle select, swallow errors
    - `deleteLearning(id) => Effect<{ success, error? }, DatabaseError>`
    - `deleteLearnings(filters) => Effect<{ deleted, ids }, DatabaseError>`
      - Must validate at least one filter present (return `{ deleted: 0, ids: [] }` if none)
      - Build conditions array, select IDs first, then delete
    - `getStats() => Effect<Stats, DatabaseError>` - count queries + group-by scope, swallow errors
  - Helper: `filterScopesByPriority(scopes)` - priority order: `session:` > `agent:` > `shared`. Return first group that has matches. If none, return `scopes.includes('shared') ? ['shared'] : []`.
  - Helper: `convertSqlLearningRow(row)` - convert raw SQL row to Learning domain type. Handle both snake_case and camelCase column names.
  - Create `src/learnings/live.ts`: Implement `HttpApiBuilder.group(Api, 'learnings', (handlers) => ...)` for all learning endpoints:
    - Wire each endpoint to the corresponding `LearningsRepo` method
    - POST /learn: extract body fields, call `repo.learn(scope ?? 'shared', trigger ?? '', learning ?? '', confidence, reason, source)` - note confidence default is undefined here (REST default 0.5 is the service.learn() default)
    - POST /inject: extract body, call repo.inject, then `maybeAttachState` helper for includeState/runId
    - POST /inject/trace: extract body + query param threshold, call repo.injectTrace
    - POST /query: extract body with field name `text` (NOT `query`), call repo.query
    - GET /stats: call repo.getStats()
    - GET /learnings: read query params scope/limit, call repo.getLearnings
    - DELETE /learnings: read query params, validate at least one filter present (return 400 if none), call repo.deleteLearnings
    - DELETE /learning/:id: read path param, call repo.deleteLearning
    - GET /learning/:id/neighbors: read path param + query params threshold/limit, call repo.getLearningNeighbors
  - Helper in live.ts: `maybeAttachState(result, includeState, runId, format)` - if includeState && runId, fetch state from StateRepo, prepend `formatStatePrompt(state)` to result.prompt
  - Helper: `formatStatePrompt(state)` - reproduce exact format from `src/service.ts:193-219`

  **Must NOT do**:
  - Do not change ID generation format (`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  - Do not change embedding text format (`When ${trigger}, ${learning}`)
  - Do not change inject prompt join format (`\n` between learnings)
  - Do not change vector query SQL (vector32, vector_distance_cos)
  - Do not add transactions on inject recall tracking update
  - Do not change error swallowing behavior on inject/query/getLearnings (log + return empty)
  - Do not change filterScopesByPriority logic (session: > agent: > shared)
  - Do not change similarity calculation: `1 - Number(row.distance ?? 0)`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Largest task - complex vector SQL, embedding integration, error handling semantics, 9 endpoints
  - **Skills**: []
  - Run `bunx effect-solutions show services-and-layers error-handling` before writing code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Tasks 12 (MCP handler calls learning methods), 14 (service composition)
  - **Blocked By**: Tasks 4 (EmbeddingService), 6 (database), 7 (API schemas)

  **References**:

  **Pattern References**:
  - `/home/chase/sft-chain-transfer/api/src/wallet/wallet.live.ts` - HttpApiBuilder.group handler pattern

  **Source-of-Truth References** (CRITICAL - replicate exact logic):
  - `src/service.ts:106-118` - filterScopesByPriority: exact priority logic
  - `src/service.ts:120-160` - convertDbLearning + convertSqlLearningRow: field mapping, null/undefined handling
  - `src/service.ts:224-272` - learn(): ID generation, embedding text, vector32 insert, JSON.stringify(embedding)
  - `src/service.ts:274-328` - inject(): vector search, recall tracking update, prompt format, error swallowing
  - `src/service.ts:330-419` - injectTrace(): candidateLimit, candidates array, sorting, threshold filtering
  - `src/service.ts:421-458` - query(): vector search, hits record building, error swallowing
  - `src/service.ts:461-498` - getLearningNeighbors(): self-join vector query, threshold filtering
  - `src/service.ts:500-518` - getLearnings(): drizzle select with optional scope/limit, error swallowing
  - `src/service.ts:520-566` - deleteLearning + deleteLearnings: conditions building, filter validation
  - `src/service.ts:634-687` - getStats(): count queries + group-by scope queries, error swallowing
  - `src/service.ts:193-219` - formatStatePrompt: exact string format for working state prompt
  - `src/index.ts:342-361` - maybeAttachState: includeState + runId logic, prompt prepending
  - `src/index.ts:654-771` - All learning route handlers (exact body field names, query params, defaults)

  **External References**:
  - `@effect/sql-libsql` SqlClient.unsafe() for vector queries
  - `src/embeddings.ts` - EmbeddingService.embed() call pattern

  **Acceptance Criteria**:
  - [ ] `src/learnings/repo.ts` exports `LearningsRepo` class (extends `Effect.Service`) with `.Default` layer
  - [ ] `src/learnings/live.ts` exports handler registration for all 9+ learning endpoints (including stats)
  - [ ] Vector queries use `SqlClient.unsafe()` with `JSON.stringify(embedding)` and `vector32(?)`
  - [ ] Error swallowing: inject/query/getLearnings catch errors and return empty results
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: Learnings repo + handlers type-check
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Verify src/learnings/repo.ts and src/learnings/live.ts compile
    Expected Result: Clean type check
    Evidence: .sisyphus/evidence/task-8-typecheck.txt

  Scenario: Vector query patterns preserved
    Tool: Bash
    Steps:
      1. Grep src/learnings/repo.ts for 'vector32'
      2. Grep src/learnings/repo.ts for 'vector_distance_cos'
      3. Grep src/learnings/repo.ts for 'JSON.stringify'
    Expected Result: All three patterns present (vector insert + vector search + JSON serialization)
    Evidence: .sisyphus/evidence/task-8-vector-patterns.txt

  Scenario: Error swallowing preserved
    Tool: Bash
    Steps:
      1. Grep src/learnings/repo.ts for patterns indicating error recovery (Effect.catchAll, Effect.orElseSucceed, or similar)
      2. Verify inject, query, and getLearnings methods have error recovery returning empty results
    Expected Result: Error swallowing patterns found in inject, query, and getLearnings
    Evidence: .sisyphus/evidence/task-8-error-swallow.txt

  Scenario: ID generation format preserved
    Tool: Bash
    Steps:
      1. Grep src/learnings/repo.ts for 'Date.now()' and 'Math.random'
    Expected Result: ID generation uses Date.now + random9 format
    Evidence: .sisyphus/evidence/task-8-id-gen.txt
  ```

  **Commit**: YES
  - Message: `feat(learnings): implement learnings repository and API handlers`
  - Files: `src/learnings/repo.ts`, `src/learnings/live.ts`

- [ ] 9. Secrets Repository + Handlers

  **What to do**:
  - Create `src/secrets/repo.ts`: Define `SecretsRepo` using `Effect.Service` pattern with methods:
    - `getSecret(scopes, name) => Effect<string | null, DatabaseError>`
      - Call `filterScopesByPriority(scopes)` first - return null if empty
      - Drizzle select from secrets WHERE name=? AND scope IN (?), limit 1
      - Return `results[0]?.value ?? null`
      - **Error handling**: swallow errors (log + return null)
    - `setSecret(scope, name, value) => Effect<{ success, error? }, DatabaseError>`
      - Raw SQL via `SqlClient.unsafe()`: `INSERT INTO secrets (name, value, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      - **CRITICAL**: Preserve the ON CONFLICT(name) bug - it ignores scope. Do NOT fix this.
      - **Error handling**: swallow errors (log + return `{ success: false, error: 'Failed to set secret' }`)
    - `deleteSecret(scope, name) => Effect<{ success, error? }, DatabaseError>`
      - Drizzle delete WHERE name=? AND scope=?
      - **Error handling**: swallow errors
    - `listSecrets(scope?) => Effect<Secret[], DatabaseError>`
      - Drizzle select, optional scope filter, order by updatedAt DESC
  - Import `filterScopesByPriority` from learnings/repo.ts (or extract to shared util)
  - Create `src/secrets/live.ts`: Implement handlers:
    - POST /secret: extract body `{ name, value, scope? }`, call setSecret(scope ?? 'shared', name, value)
    - GET /secret/:name: extract path param, query param `scopes` (comma-separated string split), call getSecret
      - If null, return 404 `{ error: 'not found' }`
      - If found, return `{ value }`
    - DELETE /secret/:name: extract path param, query param `scope` (default 'shared'), call deleteSecret
      - If error, return 404
    - GET /secrets: extract query param `scope?`, call listSecrets

  **Must NOT do**:
  - Do not fix the ON CONFLICT(name) scope-ignoring bug
  - Do not add secret encryption or masking
  - Do not change error swallowing behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small service, 4 simple endpoints, straightforward CRUD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10, 11)
  - **Blocks**: Tasks 12 (MCP handler), 14 (service composition)
  - **Blocked By**: Tasks 6 (database), 7 (API schemas)

  **References**:

  **Source-of-Truth References**:
  - `src/service.ts:570-630` - getSecret, setSecret, deleteSecret: exact logic including ON CONFLICT bug and error swallowing
  - `src/index.ts:774-813` - All secret route handlers: body/query params, response shapes, 404 handling
  - `src/service.ts:106-118` - filterScopesByPriority (shared with learnings)

  **Acceptance Criteria**:
  - [ ] `src/secrets/repo.ts` exports `SecretsRepo` class (extends `Effect.Service`) with `.Default` layer
  - [ ] `src/secrets/live.ts` exports handler registration for all 4 secret endpoints
  - [ ] setSecret uses raw SQL with ON CONFLICT(name) (not ON CONFLICT(name, scope))
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: Secrets repo + handlers type-check
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
    Expected Result: Clean type check for secrets module
    Evidence: .sisyphus/evidence/task-9-typecheck.txt

  Scenario: ON CONFLICT bug preserved
    Tool: Bash
    Steps:
      1. Grep src/secrets/repo.ts for 'ON CONFLICT'
      2. Verify it says 'ON CONFLICT(name)' NOT 'ON CONFLICT(name, scope)'
    Expected Result: ON CONFLICT(name) without scope
    Evidence: .sisyphus/evidence/task-9-conflict-bug.txt
  ```

  **Commit**: YES
  - Message: `feat(secrets): implement secrets repository and API handlers`
  - Files: `src/secrets/repo.ts`, `src/secrets/live.ts`

- [ ] 10. State Repository + Handlers

  **What to do**:
  - Create `src/state/repo.ts`: Define `StateRepo` using `Effect.Service` pattern with methods:
    - `getState(runId) => Effect<WorkingStateResponse | null, DatabaseError>`
      - Drizzle select from stateRuns WHERE runId=?, limit 1
      - Parse stateJson via `JSON.parse(current.stateJson || '{}')` - do NOT use Schema validation on stored state
      - Map row fields to WorkingStateResponse
    - `upsertState(runId, payload, updatedBy?, changeSummary?) => Effect<WorkingStateResponse, DatabaseError>`
      - Normalize payload via `normalizeWorkingStatePayload`
      - Get existing state, compute nextRevision = (existing?.revision ?? 0) + 1
      - If existing: drizzle update stateRuns
      - If new: drizzle insert stateRuns with status='active'
      - Always: drizzle insert stateRevisions with id=crypto.randomUUID()
      - Return getState(runId) result
    - `patchState(runId, patch, updatedBy?) => Effect<WorkingStateResponse, DatabaseError>`
      - Get current state (or create default if not found: revision 0, status 'active', empty state)
      - Merge: `{ ...current.state, ...normalizeWorkingStatePayload({ ...current.state, ...patch }) }`
      - Call upsertState with merged state, changeSummary='state patch'
    - `addStateEvent(runId, eventType, payload, createdBy?) => Effect<{ success: true, id }, DatabaseError>`
      - Insert into stateEvents with id=crypto.randomUUID(), payloadJson=JSON.stringify(payload ?? {})
    - `resolveState(runId, opts?) => Effect<WorkingStateResponse | null, DatabaseError | EmbeddingError>`
      - Get current state, return null if not found
      - Update stateRuns: status='resolved', resolvedAt=now
      - If opts.persistToLearn: build compact summary string, call LearningsRepo.learn()
        - Compact: `Goal: ${goal} | Decisions: ${decisions.map(d=>d.text).join('; ')} | Next actions: ${next_actions.join('; ')}`
        - Trigger: `run:${runId} resolved`
        - Confidence: state.confidence ?? 0.8
        - Reason: 'Derived from working state resolve'
        - Source: `state:${runId}`
      - Return getState(runId)
  - Helper: `normalizeWorkingStatePayload(payload)` - reproduce exact logic from `src/service.ts:162-191`:
    - goal: trim string or undefined
    - assumptions: filter/trim string array
    - decisions: map to `{ id?, text, status? }`, filter by non-empty text
    - open_questions, next_actions: filter/trim string arrays
    - confidence: validate finite number or undefined
  - Create `src/state/live.ts`: Implement handlers:
    - GET /state/:runId: call getState, return 404 `{ error: 'not found' }` if null
    - PUT /state/:runId: extract body, call upsertState with changeSummary from body or default 'state put'
    - PATCH /state/:runId: extract body, call patchState
    - POST /state/:runId/events: extract body, handle payload field (if body.payload exists use it, otherwise use whole body)
    - POST /state/:runId/resolve: extract body, call resolveState, return 404 if null

  **Must NOT do**:
  - Do not validate stored state_json with Effect Schema (keep JSON.parse passthrough)
  - Do not change ID generation (crypto.randomUUID() for state/revisions/events)
  - Do not add transactions on upsert + revision insert
  - Do not change normalizeWorkingStatePayload logic
  - Do not change resolveState compact summary format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple methods with careful state management logic, but not algorithmically complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11)
  - **Blocks**: Tasks 12 (MCP handler), 14 (service composition)
  - **Blocked By**: Tasks 6 (database), 7 (API schemas)

  **References**:

  **Source-of-Truth References** (CRITICAL - replicate exact logic):
  - `src/service.ts:162-191` - normalizeWorkingStatePayload: exact normalization logic
  - `src/service.ts:691-709` - getState: stateJson parsing, field mapping
  - `src/service.ts:711-759` - upsertState: revision tracking, stateRevisions insert
  - `src/service.ts:761-779` - patchState: merge logic with normalization
  - `src/service.ts:781-798` - addStateEvent: UUID generation, payload serialization
  - `src/service.ts:800-844` - resolveState: status update, persistToLearn compact format, learn() call
  - `src/index.ts:816-870` - All state route handlers: body extraction, defaults, 404 handling
  - `src/index.ts:846` - POST /state/:runId/events: payload field extraction logic (`body.payload ?? body`)

  **Acceptance Criteria**:
  - [ ] `src/state/repo.ts` exports `StateRepo` class (extends `Effect.Service`) with `.Default` layer
  - [ ] `src/state/live.ts` exports handler registration for all 5 state endpoints
  - [ ] State JSON parsed via JSON.parse, NOT Effect Schema
  - [ ] resolveState compact format matches: `Goal: ... | Decisions: ... | Next actions: ...`
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: State repo + handlers type-check
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
    Expected Result: Clean type check for state module
    Evidence: .sisyphus/evidence/task-10-typecheck.txt

  Scenario: State JSON not validated with Schema
    Tool: Bash
    Steps:
      1. Grep src/state/repo.ts for 'JSON.parse'
      2. Verify it does NOT use Schema.decode or Schema.parse on stored stateJson
    Expected Result: JSON.parse used for state deserialization, no Schema validation on stored state
    Evidence: .sisyphus/evidence/task-10-json-parse.txt

  Scenario: resolveState compact format correct
    Tool: Bash
    Steps:
      1. Grep src/state/repo.ts for 'Goal:' and 'Decisions:' and 'Next actions:'
      2. Verify the compact summary format matches: items joined by ' | ', decisions joined by '; '
    Expected Result: Compact format strings present with correct separators
    Evidence: .sisyphus/evidence/task-10-compact-format.txt
  ```

  **Commit**: YES
  - Message: `feat(state): implement state repository and API handlers`
  - Files: `src/state/repo.ts`, `src/state/live.ts`

- [ ] 11. Cleanup Service + Health Handlers

  **What to do**:
  - Create `src/cleanup.ts`: Define `CleanupService` using `Effect.Service` pattern with `scoped:` constructor (needs to fork background fiber for scheduled cleanup):
    - `runCleanup() => Effect<{ deleted, reasons }, DatabaseError>` implementing the exact cleanup logic:
      1. Delete session:* learnings older than 7 days (`like(scope, 'session:%') AND createdAt < weekAgo`)
      2. Delete agent:* learnings older than 30 days (`like(scope, 'agent:%') AND createdAt < monthAgo`)
      3. Delete learnings with confidence < 0.3
      - For each step: select IDs first, count them, add reason string, then delete
      - Return `{ deleted: totalCount, reasons: string[] }`
    - Schedule daily cleanup via `Effect.Schedule.cron(Cron.unsafeParse('0 0 * * *'))` combined with `Effect.repeat`
    - The scheduled cleanup should run as a background fiber (forked on layer construction)
    - Log cleanup results via `Effect.logInfo`
  - Create `src/health/live.ts`: Implement handlers:
    - `GET /` handler: return `{ status: 'ok', service: 'mnemonic' }` - no DB check, no auth
    - `POST /cleanup` handler: call `CleanupService.runCleanup()`, return result

  **Must NOT do**:
  - Do not change cleanup thresholds (7 days session, 30 days agent, 0.3 confidence)
  - Do not add health check DB ping or dependency checks
  - Do not use node-cron (use Effect.Schedule.cron)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward cleanup logic + simple health endpoint, well-defined behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: Tasks 12 (MCP handler), 14 (service composition)
  - **Blocked By**: Tasks 6 (database), 7 (API schemas)

  **References**:

  **Source-of-Truth References**:
  - `src/index.ts:363-429` - runCleanup(): exact thresholds, select-then-delete pattern, reason strings
  - `src/service.ts:846-903` - MnemonicService.cleanup(): same logic (duplicated in index.ts)
  - `src/cleanup.ts` - Current node-cron wrapper (replace with Effect.Schedule)
  - `src/index.ts:652` - GET / handler: exact response `{ status: 'ok', service: 'mnemonic' }`
  - `src/index.ts:873-875` - POST /cleanup handler

  **External References**:
  - Librarian finding: `Effect.Schedule.cron(Cron.unsafeParse('0 0 * * *'))` for daily scheduling
  - Run `bunx effect-solutions show services-and-layers` for Layer.scoped + Effect.forkDaemon pattern

  **Acceptance Criteria**:
  - [ ] `src/cleanup.ts` exports `CleanupService` class (extends `Effect.Service`) with `.Default` layer
  - [ ] `src/health/live.ts` exports handler registration for GET / and POST /cleanup
  - [ ] Cleanup thresholds: 7 days (session), 30 days (agent), 0.3 (confidence)
  - [ ] Uses Effect.Schedule.cron, NOT node-cron
  - [ ] GET / returns exactly `{ status: 'ok', service: 'mnemonic' }`
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: Cleanup + health type-check
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
    Expected Result: Clean type check for cleanup and health modules
    Evidence: .sisyphus/evidence/task-11-typecheck.txt

  Scenario: Cleanup thresholds correct
    Tool: Bash
    Steps:
      1. Grep src/cleanup.ts for '7 *' (7 days) or 7 * 24
      2. Grep src/cleanup.ts for '30 *' (30 days) or 30 * 24
      3. Grep src/cleanup.ts for '0.3' (low confidence threshold)
    Expected Result: All three thresholds present
    Evidence: .sisyphus/evidence/task-11-thresholds.txt

  Scenario: No node-cron usage
    Tool: Bash
    Steps:
      1. Grep src/cleanup.ts for 'node-cron' or 'cron' import from non-Effect package
    Expected Result: No node-cron imports, uses Effect Cron/Schedule
    Evidence: .sisyphus/evidence/task-11-no-node-cron.txt
  ```

  **Commit**: YES
  - Message: `feat(cleanup): implement cleanup service with Effect scheduling and health handlers`
  - Files: `src/cleanup.ts`, `src/health/live.ts`

- [ ] 12. MCP JSON-RPC Handler

  **What to do**:
  - Create `src/mcp/handler.ts`: Implement MCP JSON-RPC 2.0 dispatch as an Effect service:
    - Parse incoming body as JSON-RPC: extract `jsonrpc`, `id`, `method`, `params`
    - Validate `jsonrpc === '2.0'`, return error code -32600 if not
    - Route by method:
      - `initialize` -> return `{ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mnemonic', version: '1.0.0' } }`
      - `tools/list` -> return `{ tools: MCP_TOOLS }` (the full tool definitions array)
      - `tools/call` -> dispatch to tool handler by `params.name`, wrap result in `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`
      - `notifications/initialized`, `notifications/cancelled` -> return 204 No Content (no body)
      - default -> return error code -32601 `Method not found: ${method}`
    - Catch all errors in tools/call, return error code -32603 with error.message
    - All JSON-RPC responses wrap as `{ jsonrpc: '2.0', id, result }` or `{ jsonrpc: '2.0', id, error: { code, message } }`
  - Create `src/mcp/tools.ts`: Export `MCP_TOOLS` constant - the full array of tool definitions from `src/index.ts:54-311`. Copy exactly, do not modify descriptions, inputSchema, required fields, or defaults.
  - Tool dispatch (in handler.ts): Map tool names to service calls:
    - `learn` -> `LearningsRepo.learn(scope ?? 'shared', trigger ?? '', learning ?? '', confidence ?? 0.8, reason, source)` - NOTE: MCP default confidence is 0.8, not 0.5
    - `inject` -> `LearningsRepo.inject(scopes ?? ['shared'], context ?? '', limit ?? 5, 'prompt')` then `maybeAttachState`
    - `inject_trace` -> `LearningsRepo.injectTrace(scopes ?? ['shared'], context ?? '', limit ?? 5, threshold ?? 0)`
    - `query` -> `LearningsRepo.query(scopes ?? ['shared'], query ?? '', limit ?? 10)`
    - `forget` -> `LearningsRepo.deleteLearning(id ?? '')`
    - `forget_bulk` -> `LearningsRepo.deleteLearnings({ confidence_lt, not_recalled_in_days, scope })`
    - `learning_neighbors` -> `LearningsRepo.getLearningNeighbors(id ?? '', threshold ?? 0.85, limit ?? 10)`
    - `list` -> `LearningsRepo.getLearnings({ scope, limit })`
    - `stats` -> `LearningsRepo.getStats()`
    - `state_get` -> `StateRepo.getState(runId ?? '')`
    - `state_put` -> `StateRepo.upsertState(runId, payload, updatedBy, changeSummary)`
    - `state_patch` -> `StateRepo.patchState(runId ?? '', patch, updatedBy)`
    - `state_resolve` -> `StateRepo.resolveState(runId ?? '', { persistToLearn, scope, summaryStyle, updatedBy })`
    - Unknown tool -> throw Error for -32603 catch
  - Create `src/mcp/live.ts`: Implement handlers for McpApi group:
    - `POST /mcp` -> call MCP handler dispatch, handle 204 for notifications (use raw `HttpServerResponse.empty({ status: 204 })` or similar)
    - `GET /mcp` -> return `{ name: 'mnemonic', version: '1.0.0', description: '...', protocol: 'mcp', endpoint: '${url.origin}/mcp', tools: MCP_TOOLS.map(t => t.name) }`
      - Need to extract request URL origin for the endpoint field

  **Must NOT do**:
  - Do not add new MCP tools not in current list
  - Do not change tool descriptions or input schemas
  - Do not change error codes (-32600, -32601, -32603)
  - Do not change protocolVersion or serverInfo
  - Do not change notification handling (204 no body)
  - Do not change MCP learn confidence default (0.8, different from REST's undefined/0.5)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex dispatch logic, 13 tool handlers, error code semantics, 204 handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: Task 15 (server composition needs MCP handler)
  - **Blocked By**: Tasks 8, 9, 10, 11 (all repos needed for tool dispatch)

  **References**:

  **Source-of-Truth References** (CRITICAL - exact dispatch logic):
  - `src/index.ts:54-311` - MCP_TOOLS array: all 13 tool definitions with exact schemas
  - `src/index.ts:431-543` - handleMcpToolCall: exact tool dispatch mapping with defaults
  - `src/index.ts:545-618` - handleMcpRequest: JSON-RPC routing, error codes, 204 handling
  - `src/index.ts:877-890` - MCP route handlers: POST dispatch + GET info endpoint

  **Key Behavioral Details**:
  - `src/index.ts:443` - MCP learn confidence default is 0.8 (vs REST default 0.5)
  - `src/index.ts:592` - tools/call result wrapped in `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`
  - `src/index.ts:598-600` - notifications return 204 with null body
  - `src/index.ts:510-519` - state_put extracts { runId, ...payload } then calls upsert

  **Acceptance Criteria**:
  - [ ] `src/mcp/tools.ts` exports MCP_TOOLS with all 13 tool definitions
  - [ ] `src/mcp/handler.ts` exports MCP dispatch handling all methods
  - [ ] `src/mcp/live.ts` exports handler registration for POST /mcp and GET /mcp
  - [ ] MCP learn uses confidence 0.8 default (not 0.5)
  - [ ] Notifications return 204 with no body
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios:**
  ```
  Scenario: MCP handler type-checks
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
    Expected Result: Clean type check for MCP module
    Evidence: .sisyphus/evidence/task-12-typecheck.txt

  Scenario: All 13 MCP tools defined
    Tool: Bash
    Steps:
      1. Grep src/mcp/tools.ts for 'name:' to count tool definitions
      2. Verify names: learn, inject, inject_trace, query, forget, forget_bulk, learning_neighbors, list, stats, state_put, state_get, state_patch, state_resolve
    Expected Result: All 13 tools present with matching names
    Evidence: .sisyphus/evidence/task-12-tools.txt

  Scenario: MCP confidence default is 0.8
    Tool: Bash
    Steps:
      1. Grep src/mcp/handler.ts for confidence and 0.8
    Expected Result: MCP learn dispatches with confidence ?? 0.8
    Evidence: .sisyphus/evidence/task-12-confidence.txt
  ```

  **Commit**: YES
  - Message: `feat(mcp): implement MCP JSON-RPC handler with all 13 tools`
  - Files: `src/mcp/tools.ts`, `src/mcp/handler.ts`, `src/mcp/live.ts`

- [ ] 13. mnemonic-client Migration to Effect HttpClient

  **What to do**:
  - Rewrite `packages/mnemonic-client/src/index.ts` using Effect HttpClient:
    - Export `MnemonicClient` as an Effect service (`Effect.Service`) with all current methods (learn, inject, query, list, forget, stats) returning Effects instead of Promises: `class MnemonicClient extends Effect.Service<MnemonicClient>()('MnemonicClient', { ... }) {}`
    - Export `MnemonicClient.Default` layer constructor that takes `{ url: string, apiKey?: string }` and provides `HttpClient.HttpClient` layer
    - Each method: use `HttpClientRequest.post/get/del` + `HttpClientResponse.json` pattern
    - Preserve all type exports: Learning, InjectResult, QueryResult, Stats, LearnOptions, InjectOptions, etc.
    - Keep Effect as a peer dependency in `packages/mnemonic-client/package.json`
    - **ALSO** export a `mnemonic()` convenience function that wraps the Effect client in `Effect.runPromise` for backward compat:
      - This maintains the current API: `const mem = mnemonic('url', { apiKey }); await mem.learn(...)`
      - Internally creates the Effect runtime, constructs layers, runs each method call through `Effect.runPromise`
    - Update `packages/mnemonic-client/tsconfig.json` if needed for Effect types
    - Update `packages/mnemonic-client/package.json`: add `effect`, `@effect/platform` as peer deps
  - Preserve exact method signatures and option types from current client
  - Preserve error handling: HTTP errors throw with error.message or `HTTP ${status}`

  **Must NOT do**:
  - Do not change method names or option shapes
  - Do not add new client methods not in current interface
  - Do not remove the default export `mnemonic()` function (backward compat)
  - Do not add logging, retry, or caching to client

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full package rewrite but well-defined contract
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 14)
  - **Blocks**: Task 17 (client tests)
  - **Blocked By**: Task 7 (needs API types for type alignment, but can use standalone types)

  **References**:

  **Source-of-Truth References**:
  - `packages/mnemonic-client/src/index.ts` - Current client implementation (all methods, types, error handling)
  - `packages/mnemonic-client/package.json` - Current deps and build config
  - `packages/mnemonic-client/tsconfig.json` - Current TypeScript config

  **External References**:
  - Effect HttpClient patterns from `@effect/platform`
  - Run `bunx effect-solutions show basics` for Effect.runPromise patterns

  **Acceptance Criteria**:
  - [ ] Client exports both Effect-based `MnemonicClient` service AND backward-compat `mnemonic()` function
  - [ ] All current methods preserved: learn, inject, query, list, forget, stats
  - [ ] All current types preserved and exported
  - [ ] `cd packages/mnemonic-client && bunx tsc --noEmit` passes
  - [ ] `cd packages/mnemonic-client && bun run build` succeeds

  **QA Scenarios:**
  ```
  Scenario: Client package builds
    Tool: Bash
    Preconditions: packages/mnemonic-client exists
    Steps:
      1. Run `bunx tsc --noEmit` in packages/mnemonic-client
      2. Run `bun run build` in packages/mnemonic-client
    Expected Result: Type check clean, build succeeds
    Evidence: .sisyphus/evidence/task-13-build.txt

  Scenario: Backward-compat mnemonic() function exported
    Tool: Bash
    Steps:
      1. Grep packages/mnemonic-client/src/index.ts for 'export default mnemonic' or 'export function mnemonic'
      2. Grep for 'MnemonicClient' export
    Expected Result: Both mnemonic function and MnemonicClient type exported
    Evidence: .sisyphus/evidence/task-13-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(client): migrate mnemonic-client to Effect HttpClient with backward compat`
  - Files: `packages/mnemonic-client/src/index.ts`, `packages/mnemonic-client/package.json`, `packages/mnemonic-client/tsconfig.json`

- [ ] 14. Delete Old Files + Service/Layer Composition

  **What to do**:
  - **Delete old source files**:
    - `src/index.ts` (old Hono monolith - replaced by new entrypoint)
    - `src/service.ts` (old MnemonicService class - replaced by repos)
    - `src/db.ts` (old database init - replaced by database.ts)
    - `src/cleanup.ts` will be OVERWRITTEN by Task 11 (not deleted, just confirming)
    - `src/embeddings.ts` will be OVERWRITTEN by Task 4 (not deleted, just confirming)
    - `jest.config.js` (already deleted by Task 1)
  - **Create `src/services.ts`**: Layer composition file that combines all service layers:
    - `InfraLive` = `AppConfig.Default` + `Database.Default` + `EmbeddingService.Default` -> provides config, DB, embeddings
    - `ServicesLive` = `LearningsRepo.Default` + `SecretsRepo.Default` + `StateRepo.Default` + `CleanupService.Default` -> provides all repos
    - `AppLive` = `InfraLive` >>> `ServicesLive` -> full service layer
    - Follow `/home/chase/sft-chain-transfer/api/src/service.ts` pattern for layer composition
    - **NOTE**: All services use `Effect.Service` pattern, so their default layers are accessed via `ServiceName.Default` (not `ServiceNameLive`)
  - **Create `src/http.ts`**: Server composition file:
    - `HttpLive` = `HttpApiBuilder.serve(Api).pipe(...)` composing all handler layers:
      - `.add(LearningsHandlers)` from learnings/live.ts
      - `.add(SecretsHandlers)` from secrets/live.ts
      - `.add(StateHandlers)` from state/live.ts
      - `.add(HealthHandlers)` from health/live.ts
      - `.add(McpHandlers)` from mcp/live.ts
      - `.middleware(HttpApiBuilder.middlewareCors())` for CORS
    - Follow `/home/chase/sft-chain-transfer/api/src/http.ts` pattern
  - Verify no remaining imports of deleted files in any new source file

  **Must NOT do**:
  - Do not delete `src/schema.ts` (still needed by drizzle)
  - Do not delete `drizzle.config.ts`
  - Do not delete `prd.ts`
  - Do not delete `drizzle/` directory
  - Do not add OpenTelemetry or tracing layers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + layer wiring following established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13)
  - **Blocks**: Task 15 (server entrypoint needs services.ts and http.ts)
  - **Blocked By**: Tasks 8, 9, 10, 11 (all repos must exist before composing)

  **References**:

  **Pattern References**:
  - `/home/chase/sft-chain-transfer/api/src/service.ts` - Layer composition pattern (InfraLive >>> ServicesLive)
  - `/home/chase/sft-chain-transfer/api/src/http.ts` - HttpApiBuilder.serve + handler composition
  - `/home/chase/sft-chain-transfer/api/src/index.ts` - How layers are combined at entrypoint

  **Acceptance Criteria**:
  - [ ] Old files deleted: src/index.ts (old), src/service.ts, src/db.ts, jest.config.js
  - [ ] `src/services.ts` exports `AppLive` layer composing all services
  - [ ] `src/http.ts` exports `HttpLive` layer composing all handlers + CORS
  - [ ] `bunx tsc --noEmit` passes (no broken imports)
  - [ ] No imports of 'hono', 'node-cron', 'zod' remain in src/

  **QA Scenarios:**
  ```
  Scenario: Old files removed
    Tool: Bash
    Steps:
      1. Check src/service.ts does NOT exist
      2. Check src/db.ts does NOT exist
      3. Check jest.config.js does NOT exist
    Expected Result: All three files absent
    Evidence: .sisyphus/evidence/task-14-deleted.txt

  Scenario: No old framework imports remain
    Tool: Bash
    Steps:
      1. Grep -r 'from.*hono' src/
      2. Grep -r 'node-cron' src/
      3. Grep -r 'from.*zod' src/
    Expected Result: No matches
    Evidence: .sisyphus/evidence/task-14-no-old-imports.txt

  Scenario: Layer composition type-checks
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
    Expected Result: Clean type check
    Evidence: .sisyphus/evidence/task-14-typecheck.txt
  ```

  **Commit**: YES
  - Message: `refactor: delete old Hono code and compose Effect service layers`
  - Files: `src/services.ts`, `src/http.ts` (+ deleted files)

- [ ] 15. Server Composition + Entrypoint

  **What to do**:
  - Create `src/index.ts` (NEW - replaces the deleted Hono monolith):
    - Follow `/home/chase/sft-chain-transfer/api/src/index.ts` pattern exactly:
      1. Import `BunHttpServer` from `@effect/platform-bun`
      2. Import `BunRuntime` from `@effect/platform-bun`
      3. Import `Layer` from `effect`
      4. Compose final layer:
         ```
         const MainLive = HttpLive.pipe(
           Layer.provide(AppLive),
           Layer.provide(AuthorizationLive),
           Layer.provide(BunHttpServer.layer({ port })),
         )
         ```
      5. Get port from AppConfig (read via Config.integer or construct layer with Effect.gen)
      6. Start server: `Layer.launch(MainLive).pipe(BunRuntime.runMain)`
    - **CRITICAL**: Port must come from AppConfig. May need `Effect.gen` + `Config.integer` to read port before constructing BunHttpServer.layer.
    - **CRITICAL**: EmbeddingService initialization (model loading) happens lazily via Layer.scoped on first use, but the log messages 'Loading embedding model...' and 'Embedding model loaded' should still appear.
    - The server should log startup message similar to current: server running indication
    - Not-found handling: HttpApi's default 404 should return `{ error: 'not found' }` - may need custom error handler or HttpApiBuilder error middleware
    - Global error handler: 500s should return `{ error: message }` (match current `app.onError`)

  **Must NOT do**:
  - Do not add OpenTelemetry
  - Do not add graceful shutdown beyond what Effect provides by default
  - Do not hardcode port (must read from config)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Critical wiring task - must get layer composition exactly right for everything to work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (solo)
  - **Blocks**: Tasks 16, 17 (tests need running server)
  - **Blocked By**: Tasks 5 (auth), 7 (root API), 12 (MCP handler), 14 (services.ts, http.ts)

  **References**:

  **Pattern References**:
  - `/home/chase/sft-chain-transfer/api/src/index.ts` - EXACT entrypoint pattern (BunHttpServer + BunRuntime + Layer.launch)
  - `src/http.ts` (Task 14) - HttpLive layer to use
  - `src/services.ts` (Task 14) - AppLive layer to use
  - `src/security.ts` (Task 5) - AuthorizationLive layer

  **Source-of-Truth References**:
  - `src/index.ts:901-902` (old) - Port configuration and Bun.serve pattern (replace with Effect)
  - `src/index.ts:892-897` (old) - 404 and error handlers (must replicate behavior)

  **Acceptance Criteria**:
  - [ ] `src/index.ts` uses BunHttpServer.layer + BunRuntime.runMain + Layer.launch pattern
  - [ ] Port read from AppConfig (not hardcoded)
  - [ ] `bunx tsc --noEmit` passes
  - [ ] `bun run src/index.ts` starts server (manual verification in QA)

  **QA Scenarios:**
  ```
  Scenario: Server starts and responds to health check
    Tool: Bash
    Steps:
      1. Start server in background: `API_KEY=test-key bun run src/index.ts &`
      2. Wait 5 seconds for startup
      3. curl -s http://localhost:8787/
      4. Assert response contains '"status":"ok"'
      5. Kill background server
    Expected Result: Server starts, health returns { status: 'ok', service: 'mnemonic' }
    Evidence: .sisyphus/evidence/task-15-health.txt

  Scenario: Auth works - rejected without key
    Tool: Bash
    Steps:
      1. Start server: `API_KEY=test-key bun run src/index.ts &`
      2. Wait 5 seconds
      3. curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/stats
      4. Assert status is 401
      5. curl -s -H 'Authorization: Bearer test-key' http://localhost:8787/stats
      6. Assert status is 200
      7. Kill server
    Expected Result: Unauthenticated request returns 401, authenticated returns 200
    Evidence: .sisyphus/evidence/task-15-auth.txt

  Scenario: 404 handler works
    Tool: Bash
    Steps:
      1. Start server: `API_KEY=test-key bun run src/index.ts &`
      2. Wait 5 seconds
      3. curl -s http://localhost:8787/nonexistent
      4. Assert response contains 'not found' and status is 404
      5. Kill server
    Expected Result: Unknown route returns 404 with error message
    Evidence: .sisyphus/evidence/task-15-404.txt
  ```

  **Commit**: YES
  - Message: `feat(server): wire server entrypoint with BunHttpServer and BunRuntime`
  - Files: `src/index.ts`

- [ ] 16. Integration Tests

  **What to do**:
  - Create `test/mnemonic.test.ts` (replaces `test/mnemonic-do.test.ts`) using `@effect/vitest`:
    - Test the full stack by starting the server and making HTTP requests
    - Cover the critical paths:
      1. **Learn + Inject round-trip**: POST /learn, then POST /inject with matching context, verify learning returned
      2. **Learn + Query**: POST /learn, then POST /query, verify results
      3. **Inject trace**: POST /inject/trace, verify candidate structure
      4. **Learning CRUD**: POST /learn, GET /learnings, DELETE /learning/:id, verify deletion
      5. **Bulk delete**: POST /learn multiple, DELETE /learnings?confidence_lt=0.3, verify correct ones deleted
      6. **Learning neighbors**: POST /learn two similar, GET /learning/:id/neighbors, verify similarity
      7. **Stats**: GET /stats after learning operations
      8. **Secrets CRUD**: POST /secret, GET /secret/:name, DELETE /secret/:name
      9. **State lifecycle**: PUT /state/:runId, GET, PATCH, POST events, POST resolve
      10. **State resolve with persist**: POST resolve with persistToLearn=true, verify learning created
      11. **MCP initialize**: POST /mcp with initialize method
      12. **MCP tools/list**: POST /mcp with tools/list method
      13. **MCP tools/call learn**: POST /mcp with tools/call + learn tool
      14. **MCP tools/call inject**: POST /mcp with tools/call + inject tool
      15. **Health**: GET / returns { status: 'ok' }
      16. **Auth rejected**: Request without Bearer returns 401
      17. **Auth bypass**: When API_KEY unset, requests succeed without auth
    - Use `beforeAll` to start server, `afterAll` to kill it
    - Use real libsql database (in-memory or temp file) and real embedding model
    - Keep tests similar in spirit to current `test/mnemonic-do.test.ts` but adapted for new structure

  **Must NOT do**:
  - Do not mock the database or embedding service (use real ones like current tests)
  - Do not add snapshot tests
  - Do not test internal service methods directly (only HTTP API)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full integration test suite, many scenarios, real services
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 17)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 15 (needs working server)

  **References**:

  **Source-of-Truth References**:
  - `test/mnemonic-do.test.ts` - Current test file (adapt patterns, not copy verbatim)
  - All route handlers in current index.ts - expected request/response shapes
  - Run `bunx effect-solutions show testing` for @effect/vitest patterns

  **Acceptance Criteria**:
  - [ ] `test/mnemonic.test.ts` exists with 15+ test cases covering all domains
  - [ ] `bun test` passes all tests
  - [ ] Tests use real libsql + real embedding model (no mocks)

  **QA Scenarios:**
  ```
  Scenario: Integration tests pass
    Tool: Bash
    Steps:
      1. Run `bun test test/mnemonic.test.ts`
      2. Check exit code is 0
      3. Verify no test failures in output
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-16-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add integration tests with @effect/vitest`
  - Files: `test/mnemonic.test.ts`

- [ ] 17. Client Tests

  **What to do**:
  - Create `packages/mnemonic-client/test/client.test.ts` using @effect/vitest or vitest:
    - Test the backward-compat `mnemonic()` function against a running server:
      1. `learn()` returns a Learning object with expected fields
      2. `inject()` returns InjectResult with prompt and learnings
      3. `query()` returns QueryResult with learnings and hits
      4. `list()` returns Learning array
      5. `forget()` returns { success: true }
      6. `stats()` returns Stats object with correct shape
    - Also test the Effect-based MnemonicClient service (if different API):
      1. Each method returns an Effect that can be run
      2. Error cases (e.g., invalid URL) produce expected errors
    - Tests need a running mnemonic server - either:
      a. Start server in beforeAll (preferred), OR
      b. Use test server from Task 16's setup
  - Update `packages/mnemonic-client/package.json` scripts: `"test": "vitest"`
  - Create `packages/mnemonic-client/vitest.config.ts` if not using root config

  **Must NOT do**:
  - Do not mock the HTTP server (use real requests)
  - Do not change the public API interface

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test file, well-defined client interface, 6-8 test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 16)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 13 (client package), 15 (needs running server)

  **References**:

  **Source-of-Truth References**:
  - `packages/mnemonic-client/src/index.ts` - Client API to test
  - `packages/mnemonic-client/README.md` - Usage examples

  **Acceptance Criteria**:
  - [ ] `packages/mnemonic-client/test/client.test.ts` exists with tests for all 6 client methods
  - [ ] `cd packages/mnemonic-client && bun test` passes

  **QA Scenarios:**
  ```
  Scenario: Client tests pass
    Tool: Bash
    Steps:
      1. Run `cd packages/mnemonic-client && bun test`
      2. Check exit code is 0
    Expected Result: All client tests pass
    Evidence: .sisyphus/evidence/task-17-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add mnemonic-client integration tests`
  - Files: `packages/mnemonic-client/test/client.test.ts`, `packages/mnemonic-client/vitest.config.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan. Run `MNEMONIC_URL=http://localhost:8787 MNEMONIC_API_KEY=test-key bun run prd.ts` and assert 6/6 pass.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod code (Effect.log is fine), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify `effect-solutions show <topic>` patterns are followed. Verify no Hono, node-cron, or Zod imports remain.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start server from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: learn → inject round-trip, state create → resolve → persist-to-learn chain, MCP tools/call → service. Test edge cases: empty DB, invalid JSON body, missing auth header, unknown MCP method. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual files. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect scope creep: new endpoints not in plan, new MCP tools, OpenAPI/Swagger, tracing. Verify old files removed (hono imports, jest.config.js, node-cron). Flag unaccounted files.
  Output: `Tasks [N/N compliant] | Scope Creep [CLEAN/N issues] | Old Files [CLEAN/N remaining] | VERDICT`

---

## Commit Strategy

After each wave completes:
- Wave 1-2: `feat(infra): add Effect foundation — config, errors, database, embedding services`
- Wave 3: `feat(domain): implement learnings, secrets, state, cleanup services with handlers`
- Wave 4: `feat(mcp): add MCP JSON-RPC handler and migrate mnemonic-client to Effect`
- Wave 5: `feat(server): wire root API, HTTP server, and entrypoint`
- Wave 6: `test: migrate integration and client tests to @effect/vitest`
- Final cleanup: `chore: remove old Hono/Jest/node-cron code`

---

## Success Criteria

### Verification Commands
```bash
# Type check
bunx tsc --noEmit  # Expected: exit 0

# Start server
API_KEY=test-key bun run src/index.ts &  # Expected: "Server running on port 8787"

# Smoke gates
MNEMONIC_URL=http://localhost:8787 MNEMONIC_API_KEY=test-key bun run prd.ts  # Expected: 6 passed, 0 failed

# Integration tests
bun test  # Expected: all pass

# Client build + test
cd packages/mnemonic-client && bun run build && bun test  # Expected: exit 0
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] prd.ts smoke gates pass (6/6)
- [ ] No Hono, node-cron, Zod, or Jest imports in src/
- [ ] No `as any` except in drizzle schema customType (F32_BLOB)
