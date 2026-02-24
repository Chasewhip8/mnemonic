# Rewrite deja-client with HttpApiClient

## TL;DR

> **Quick Summary**: Replace the 257-line manual client with ~25 lines using `HttpApiClient.make(Api)`. All types, endpoints, error handling, and auth derive automatically from the existing server API definition. Co-locate `src/client.ts` with the API definitions; `packages/deja-client/` becomes a thin publishing wrapper with tsup bundling + tree-shaking.
> 
> **Deliverables**:
> - `src/client.ts` — DejaClient Effect.Service wrapping HttpApiClient.make(Api)
> - Rewritten `packages/deja-client/` — new build config, re-export, updated deps
> - Updated README reflecting Effect-only API
> - Minimal smoke test
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5

---

## Context

### Original Request
Redo `packages/deja-client` entirely. Use the HttpApi client for automatic type derivation. Stop redefining types. Make the client incredibly simple. Effect-only (drop Promise wrapper). Expose all endpoints.

### Interview Summary
**Key Discussions**:
- **Sharing strategy**: Co-locate `src/client.ts` with server API definitions. `packages/deja-client/` is just a publishing wrapper. tsup tree-shakes server-only deps.
- **Promise wrapper**: Drop it — Effect-only.
- **Endpoint coverage**: All 20 endpoints (free with HttpApiClient.make).
- **Tests**: Minimal smoke test only.

**Research Findings**:
- API definition dependency chain is clean: `domain.ts` → `effect` only; `errors.ts` → `effect` + `@effect/platform`; `security.ts` Tag → `@effect/platform` + `errors.ts`. No server-only deps needed.
- `HttpApiClient.make(Api, { baseUrl, transformClient })` returns `Effect.Effect` (NOT scoped). Must use `effect:` in `Effect.Service`.
- Auth: `transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token))`
- Confirmed via Effect-TS/effect source: client methods take `{ payload?, path?, urlParams?, withResponse? }` — group-namespaced as `client.learnings.learn(...)`, `client.state.getState(...)`, etc.

### Metis Review
**Identified Gaps** (addressed):
- **tsconfig rootDir violation**: Cross-package import from `../../src/client.ts` breaks DTS generation. **Resolution**: Point tsup directly at `../../src/client.ts` as entry point, bypassing rootDir constraint.
- **`effect:` vs `scoped:`**: HttpApiClient.make is NOT scoped. **Resolution**: Plan specifies `effect:` explicitly.
- **Version bump**: Breaking change for npm consumers. **Resolution**: Bump to `0.2.0`.
- **config.ts dead weight**: `security.ts` → `config.ts` import pulls AppConfig into bundle (inert). **Resolution**: Accept — ~20 lines of dead code, not worth refactoring security.ts.
- **LearningWithSimilarity not named-exportable**: Defined locally in `learnings/api.ts`. **Resolution**: Defer to separate task, accept inline type.

### Current Bugs (Auto-Fixed by This Rewrite)
- `Stats.scopes`: Client types as `Record<string,{learnings,secrets}>`, server returns `Array<{scope,count}>` — silent mismatch
- `Learning`: Missing `lastRecalledAt`, `recallCount` fields
- `InjectResult`: Missing `state?` field
- `InjectBody`: Missing `includeState`, `runId` fields
- Only 6/20 endpoints exposed

---

## Work Objectives

### Core Objective
Replace the manually-typed HTTP client with `HttpApiClient.make(Api)` to get automatic type safety, full endpoint coverage, and proper error typing from the existing API definition.

### Concrete Deliverables
- `src/client.ts` — new file (~25-35 lines)
- `packages/deja-client/src/index.ts` — rewritten (thin re-export)
- `packages/deja-client/package.json` — updated deps, build script, version
- `packages/deja-client/tsconfig.json` — updated for cross-package import
- `packages/deja-client/README.md` — updated for Effect-only API
- `packages/deja-client/test/client.test.ts` — minimal smoke test

### Definition of Done
- [ ] `tsc --noEmit` passes for root project (src/client.ts valid)
- [ ] `bun run build` in `packages/deja-client/` succeeds
- [ ] `dist/` excludes server-only code (no drizzle, libsql, huggingface)
- [ ] `bun test` in `packages/deja-client/` passes (smoke test)
- [ ] Client exposes all 4 groups with all 20 endpoints (type-level verification)

### Must Have
- DejaClient as `Effect.Service` wrapping `HttpApiClient.make(Api)` with `effect:` (NOT `scoped:`)
- `dependencies: [FetchHttpClient.layer]` in service definition
- Config-driven: `DEJA_URL` (default `http://localhost:8787`), `DEJA_API_KEY` (optional)
- Auth via `transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(...))`
- Re-export of domain types (Learning, InjectResult, QueryResult, Stats, etc.) and error types
- Re-export of `Api` class itself (for consumers who want custom clients)
- Version bump to `0.2.0`
- tsup builds clean bundle with tree-shaking

### Must NOT Have (Guardrails)
- NO Promise-based wrapper (`deja()` function) — Effect-only
- NO positional convenience methods (`client.learn(trigger, learning)`) — use group-namespaced methods
- NO manual type definitions (interfaces for Learning, Stats, etc.) — all derived from schemas
- NO changes to server files: `src/domain.ts`, `src/errors.ts`, `src/security.ts`, `src/*/api.ts`, `src/*/live.ts`
- NO `scoped:` in Effect.Service — HttpApiClient.make is not scoped
- NO `as T` type assertions — all types derived from schemas
- NO server-only imports in client.ts (drizzle, libsql, huggingface, sql, config, repo, live)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in packages/deja-client)
- **Automated tests**: Minimal smoke test
- **Framework**: vitest (existing)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build verification**: Use Bash — `bun run build`, `tsc --noEmit`
- **Bundle analysis**: Use Bash (grep) — check dist/ for forbidden imports
- **Type verification**: Use Bash — `tsc --noEmit` catches type errors
- **Integration**: Use Bash — `bun test` runs smoke test against real server

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 3 parallel tasks):
├── Task 1: Create src/client.ts [quick]
├── Task 2: Reconfigure packages/deja-client build system [quick]
└── Task 3: Update README [writing]

Wave 2 (After Wave 1 — 2 parallel tasks):
├── Task 4: Rewrite smoke test [quick]
└── Task 5: Full verification — build, types, bundle analysis [quick]

Critical Path: Task 1 → Task 5
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 4, 5 | 1 |
| 3 | — | — | 1 |
| 4 | 1, 2 | 5 | 2 |
| 5 | 1, 2, 4 | F1-F4 | 2 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `writing`
- **Wave 2**: 2 tasks — T4 → `quick`, T5 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Create `src/client.ts` — DejaClient Effect.Service

  **What to do**:
  - Run `bunx effect-solutions show services-and-layers` to confirm Effect.Service patterns
  - Create `src/client.ts` with:
    - `DejaClient` as `Effect.Service` using `effect:` (NOT `scoped:`)
    - `dependencies: [FetchHttpClient.layer]`
    - Inside `Effect.gen`: read `Config.string('DEJA_URL')` (default `http://localhost:8787`) and `Config.option(Config.redacted('DEJA_API_KEY'))`
    - Call `HttpApiClient.make(Api, { baseUrl, transformClient })` where `transformClient` conditionally adds bearer token via `HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(key)))`
    - Return the client directly — the Service type IS the HttpApiClient.Client type
  - Re-export key domain types: `Learning`, `InjectResult`, `InjectTraceResult`, `QueryResult`, `Stats`, `Secret`, `WorkingStatePayload`, `WorkingStateResponse` from `./domain`
  - Re-export error types: `NotFoundError`, `ValidationError`, `DatabaseError`, `EmbeddingError`, `Unauthorized` from `./errors`
  - Re-export `Api` from `./api` (for consumers building custom clients)
  - The file should be ~25-35 lines total

  **Must NOT do**:
  - Do NOT use `scoped:` — HttpApiClient.make returns plain Effect, not scoped
  - Do NOT define any TypeScript interfaces or type aliases — all types come from schema re-exports
  - Do NOT add positional convenience wrappers like `learn(trigger, learning)`
  - Do NOT add a Promise-based wrapper
  - Do NOT import anything from server-only files (database, schema, embeddings, config, repo, live, http)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - No special skills needed — small file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/api.ts` — The `Api` class to import: `HttpApi.make('deja').add(LearningsApi).add(SecretsApi).add(StateApi).add(HealthApi)`
  - `src/domain.ts` — All domain Schema.Class types to re-export (Learning, InjectResult, QueryResult, Stats, Secret, WorkingStatePayload, WorkingStateResponse, InjectTraceResult)
  - `src/errors.ts` — All error TaggedError types to re-export (DatabaseError, EmbeddingError, NotFoundError, Unauthorized, ValidationError)
  - `src/security.ts:9-17` — `Authorization` middleware tag definition (uses HttpApiSecurity.bearer)
  - `packages/deja-client/src/index.ts:92-191` — Current DejaClient Effect.Service definition (to understand the Config pattern for DEJA_URL and DEJA_API_KEY, then replace the manual HTTP wiring)

  **API/Type References**:
  - HttpApiClient.make signature: `(api, options?: { baseUrl?, transformClient?, transformResponse? }) => Effect.Effect<Client<Groups, ApiError, never>, never, HttpClient.HttpClient | ...>`
  - transformClient pattern: `HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(key)))`
  - The returned client shape: `{ learnings: { learn, inject, injectTrace, query, getLearnings, deleteLearnings, deleteLearning, getLearningNeighbors, getStats }, state: { getState, upsertState, patchState, addStateEvent, resolveState }, secrets: { setSecret, getSecret, deleteSecret, listSecrets }, health: { healthCheck, cleanup } }`

  **External References**:
  - Effect.Service pattern: run `bunx effect-solutions show services-and-layers`
  - Mirascope ApiClient pattern: `Effect.Service<ApiClient>()('ApiClient', { dependencies: [FetchHttpClient.layer], scoped: HttpApiClient.make(Api, { baseUrl }) })` — NOTE: use `effect:` not `scoped:` for our case
  - Effect-TS example: `packages/platform-node/examples/api.ts:L201-209` — transformClient + bearerToken pattern

  **Acceptance Criteria**:

  - [ ] `src/client.ts` exists and is < 40 lines
  - [ ] `tsc --noEmit` passes (no type errors)
  - [ ] File uses `effect:` NOT `scoped:` in Effect.Service definition
  - [ ] File imports from `./api`, `./domain`, `./errors` only (no server-only imports)
  - [ ] File does NOT define any TypeScript `interface` or `type` keywords (only re-exports)
  - [ ] Exports: `DejaClient`, `Api`, `Learning`, `InjectResult`, `InjectTraceResult`, `QueryResult`, `Stats`, `Secret`, `WorkingStatePayload`, `WorkingStateResponse`, `NotFoundError`, `ValidationError`, `DatabaseError`, `EmbeddingError`, `Unauthorized`

  **QA Scenarios:**

  ```
  Scenario: client.ts has correct structure
    Tool: Bash (grep + tsc)
    Preconditions: src/client.ts created
    Steps:
      1. Run: grep -c 'interface\|type ' src/client.ts — expect 0 (no manual type defs)
      2. Run: grep 'effect:' src/client.ts — expect match (uses effect: not scoped:)
      3. Run: grep 'HttpApiClient.make' src/client.ts — expect match
      4. Run: grep -c 'drizzle\|libsql\|huggingface\|/config\|/repo\|/live\|/http' src/client.ts — expect 0
      5. Run: tsc --noEmit — expect exit 0
    Expected Result: All assertions pass — file is minimal, type-safe, no server deps
    Failure Indicators: Any grep count > 0 for forbidden patterns, tsc failure
    Evidence: .sisyphus/evidence/task-1-client-structure.txt

  Scenario: client.ts exports all required symbols
    Tool: Bash (grep)
    Preconditions: src/client.ts created
    Steps:
      1. Run: grep 'export.*DejaClient' src/client.ts — expect match
      2. Run: grep 'export.*Api' src/client.ts — expect match
      3. Run: grep 'export.*Learning' src/client.ts — expect match
      4. Run: grep 'export.*Stats' src/client.ts — expect match
    Expected Result: All core exports present
    Evidence: .sisyphus/evidence/task-1-client-exports.txt
  ```

  **Commit**: YES — groups with Task 2
  - Message: `refactor(client): rewrite deja-client with HttpApiClient for automatic type derivation`
  - Files: `src/client.ts`, `packages/deja-client/*`

- [ ] 2. Reconfigure `packages/deja-client/` build system

  **What to do**:
  - Update `packages/deja-client/package.json`:
    - Change build script to point tsup at `../../src/client.ts`: `"build": "tsup ../../src/client.ts --format cjs,esm --dts --clean --outDir dist"`
    - Bump version to `0.2.0`
    - Keep peerDependencies: `effect` and `@effect/platform` (same versions)
    - Remove `vitest.config.ts` reference if tsup handles everything
    - Update exports to match new dist output (entry will be `client.js`/`client.mjs` not `index.js`)
  - Update or create `packages/deja-client/tsup.config.ts` if needed for `dtsResolve` or entry point configuration
  - Update `packages/deja-client/tsconfig.json`:
    - Add `../../src` to `include` array or adjust `rootDir` to allow cross-package imports
    - Or: if tsup handles DTS generation directly, tsconfig changes may be minimal
  - Rewrite `packages/deja-client/src/index.ts` to a simple re-export: `export * from '../../src/client'`
    - Or: delete it entirely if tsup points at `../../src/client.ts` directly
  - Verify `bun run build` succeeds and `dist/` is populated correctly

  **Must NOT do**:
  - Do NOT add server-only dependencies to package.json
  - Do NOT change the package name from `deja-client`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/deja-client/package.json` — Current package.json to modify (line 19 has build script, line 2 has name, line 3 has version, lines 44-47 have peerDeps)
  - `packages/deja-client/tsconfig.json` — Current tsconfig to modify (line 13 rootDir, line 15 include)

  **External References**:
  - tsup docs: entry point can be any file path; `--outDir` controls output location; `--dts` generates declarations

  **Acceptance Criteria**:

  - [ ] `bun run build` in `packages/deja-client/` exits 0
  - [ ] `dist/` contains `.js`, `.mjs`, `.d.ts`, `.d.mts` files
  - [ ] `package.json` version is `0.2.0`
  - [ ] `package.json` peerDependencies include `effect` and `@effect/platform`
  - [ ] `grep -rl 'drizzle\|libsql\|huggingface\|@effect/sql' packages/deja-client/dist/` returns no matches

  **QA Scenarios:**

  ```
  Scenario: Build succeeds and dist is clean
    Tool: Bash
    Preconditions: Task 1 complete (src/client.ts exists), package.json updated
    Steps:
      1. Run: cd packages/deja-client && bun run build
      2. Run: ls packages/deja-client/dist/ — expect .js, .mjs, .d.ts files
      3. Run: grep -rl 'drizzle\|libsql\|huggingface\|@effect/sql' packages/deja-client/dist/ — expect no matches (exit 1)
      4. Run: grep -l 'HttpApiClient' packages/deja-client/dist/*.js — expect match (client code present)
    Expected Result: Build succeeds, dist populated, no server-only code in bundle
    Failure Indicators: Build failure, missing dist files, server deps found in bundle
    Evidence: .sisyphus/evidence/task-2-build-output.txt

  Scenario: Package.json is correct
    Tool: Bash (grep)
    Preconditions: package.json updated
    Steps:
      1. Run: grep '"version"' packages/deja-client/package.json — expect "0.2.0"
      2. Run: grep '"effect"' packages/deja-client/package.json — expect peerDep entry
      3. Run: grep '"@effect/platform"' packages/deja-client/package.json — expect peerDep entry
    Expected Result: Version bumped, peer deps present
    Evidence: .sisyphus/evidence/task-2-package-json.txt
  ```

  **Commit**: YES — groups with Task 1

- [ ] 3. Update README.md

  **What to do**:
  - Rewrite `packages/deja-client/README.md` to document the new Effect-only API:
    - Installation: `bun add deja-client effect @effect/platform`
    - Basic usage with `DejaClient` Effect.Service
    - Show how to provide config (`DEJA_URL`, `DEJA_API_KEY`)
    - Show example of calling endpoints: `client.learnings.learn(...)`, `client.state.getState(...)`, `client.secrets.setSecret(...)`
    - Document the group-namespaced method signature: `{ payload?, path?, urlParams?, withResponse? }`
    - List all available groups and their endpoints
    - List exported types (Learning, Stats, etc.)
  - Remove all references to the old `deja()` Promise-based API
  - Keep concise — this is a README, not a tutorial

  **Must NOT do**:
  - Do NOT document Promise-based usage
  - Do NOT document positional convenience methods

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/deja-client/README.md` — Current README to rewrite (documents the old `deja()` API and Promise-based usage)
  - `src/client.ts` (being created in Task 1) — Source of truth for exports and API shape
  - `src/learnings/api.ts` — All 9 learnings endpoints with their schemas
  - `src/state/api.ts` — All 5 state endpoints
  - `src/secrets/api.ts` — All 4 secrets endpoints
  - `src/health/api.ts` — 2 health endpoints

  **Acceptance Criteria**:

  - [ ] README.md exists and documents Effect-only usage
  - [ ] No references to `deja()` function or Promise-based API
  - [ ] Shows `DejaClient` service usage pattern
  - [ ] Lists all 4 groups and their endpoints
  - [ ] Lists exported types

  **QA Scenarios:**

  ```
  Scenario: README documents new API correctly
    Tool: Bash (grep)
    Preconditions: README.md rewritten
    Steps:
      1. Run: grep -c 'deja(' packages/deja-client/README.md — expect 0 (no old API)
      2. Run: grep -c 'await mem\.' packages/deja-client/README.md — expect 0 (no Promise usage)
      3. Run: grep 'DejaClient' packages/deja-client/README.md — expect match
      4. Run: grep 'Effect.gen' packages/deja-client/README.md — expect match (shows Effect usage)
      5. Run: grep 'learnings' packages/deja-client/README.md — expect match (documents groups)
    Expected Result: README reflects new Effect-only API, no traces of old API
    Evidence: .sisyphus/evidence/task-3-readme-check.txt
  ```

  **Commit**: YES — groups with Tasks 1, 2

---

- [ ] 4. Rewrite smoke test

  **What to do**:
  - Rewrite `packages/deja-client/test/client.test.ts`:
    - Remove all old tests (they test the deleted `deja()` wrapper)
    - Write a minimal smoke test that:
      1. Spins up a real deja server (same `spawn` + `waitForServer` pattern as existing test)
      2. Creates a `DejaClient` layer with config pointing at the test server
      3. Calls at least ONE endpoint per group to verify round-trip:
         - `client.learnings.learn({ payload: { trigger: 'test', learning: 'test' } })`
         - `client.learnings.getStats()`
         - `client.health.healthCheck()`
      4. Asserts the response matches the schema (decoded by Effect, so a successful Effect.runPromise is proof enough)
      5. Cleans up server process in afterAll
    - Use `Effect.provide` with `FetchHttpClient.layer` and a config provider for `DEJA_URL` + `DEJA_API_KEY`
    - Total test file should be < 80 lines

  **Must NOT do**:
  - Do NOT write exhaustive endpoint tests — this is a smoke test
  - Do NOT test server logic — just verify the client can call through
  - Do NOT use the old `deja()` wrapper

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `packages/deja-client/test/client.test.ts` — Current test file to rewrite. Reuse the server spawn pattern (lines 57-73: spawn bun, waitForServer), cleanup (lines 75-88: kill + rm), and `uniqueScope()` helper (line 90)
  - `src/client.ts` (Task 1) — The DejaClient service to test
  - `packages/deja-client/vitest.config.ts` — Existing vitest config (keep as-is)

  **External References**:
  - Effect testing: `Effect.runPromise(effect.pipe(Effect.provide(layer)))` for running Effects in vitest
  - Config provider: `ConfigProvider.fromMap(new Map([['DEJA_URL', baseUrl], ['DEJA_API_KEY', apiKey]]))`

  **Acceptance Criteria**:

  - [ ] `packages/deja-client/test/client.test.ts` exists and is < 80 lines
  - [ ] Test imports `DejaClient` from the new client (not old `deja()` wrapper)
  - [ ] Test verifies at least one endpoint per group (learnings, health minimum)
  - [ ] `bun test` in `packages/deja-client/` passes

  **QA Scenarios:**

  ```
  Scenario: Smoke test passes end-to-end
    Tool: Bash
    Preconditions: Tasks 1-2 complete, deja server can start
    Steps:
      1. Run: cd packages/deja-client && bun test -- --reporter=verbose
      2. Check output for "PASS" or "✓" indicators
      3. Check exit code is 0
    Expected Result: All smoke tests pass, server round-trips succeed
    Failure Indicators: Test failures, server startup timeout, connection refused
    Evidence: .sisyphus/evidence/task-4-smoke-test.txt

  Scenario: Test uses new API not old
    Tool: Bash (grep)
    Preconditions: Test file rewritten
    Steps:
      1. Run: grep -c 'deja(' packages/deja-client/test/client.test.ts — expect 0
      2. Run: grep 'DejaClient' packages/deja-client/test/client.test.ts — expect match
      3. Run: grep 'Effect' packages/deja-client/test/client.test.ts — expect match
    Expected Result: Test uses new Effect-based API exclusively
    Evidence: .sisyphus/evidence/task-4-test-api-check.txt
  ```

  **Commit**: YES — groups with Tasks 1, 2, 3

- [ ] 5. Full verification — build, types, bundle analysis

  **What to do**:
  - Run full verification suite to confirm everything works together:
    1. `tsc --noEmit` from project root — verify no type errors across entire project
    2. `cd packages/deja-client && bun run build` — verify tsup build succeeds
    3. Inspect `packages/deja-client/dist/` — verify .js, .mjs, .d.ts, .d.mts files exist
    4. `grep -rl 'drizzle\|libsql\|huggingface\|@effect/sql\|@effect/sql-drizzle\|@effect/sql-libsql' packages/deja-client/dist/` — verify no server-only deps in bundle
    5. `cd packages/deja-client && bun test` — verify smoke test passes
    6. Verify the old manual types are fully gone: `grep -c 'interface Learning\|interface InjectResult\|interface QueryResult\|interface Stats' packages/deja-client/src/index.ts` should return 0 (or file doesn't exist if deleted)
    7. Verify no Promise wrapper: `grep -c 'export function deja\|export default deja' packages/deja-client/src/index.ts src/client.ts` should return 0
  - If any check fails, investigate and fix

  **Must NOT do**:
  - Do NOT skip any verification step
  - Do NOT ignore type errors or warnings

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (runs after Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - All files from Tasks 1-4

  **Acceptance Criteria**:

  - [ ] `tsc --noEmit` passes (exit 0)
  - [ ] `bun run build` passes (exit 0)
  - [ ] dist/ contains expected files
  - [ ] No server-only deps in bundle
  - [ ] Smoke test passes
  - [ ] No old manual types remain
  - [ ] No Promise wrapper remains

  **QA Scenarios:**

  ```
  Scenario: Full stack verification
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run: tsc --noEmit — expect exit 0
      2. Run: cd packages/deja-client && bun run build — expect exit 0
      3. Run: ls packages/deja-client/dist/ — expect .js .mjs .d.ts .d.mts files
      4. Run: grep -rl 'drizzle\|libsql\|huggingface\|@effect/sql' packages/deja-client/dist/ — expect exit 1 (no matches)
      5. Run: cd packages/deja-client && bun test — expect exit 0
      6. Run: grep -c 'interface Learning' packages/deja-client/src/index.ts 2>/dev/null || echo 0 — expect 0
      7. Run: grep -c 'export function deja' packages/deja-client/src/index.ts src/client.ts 2>/dev/null || echo 0 — expect 0
    Expected Result: All 7 checks pass — types clean, build clean, bundle clean, tests pass, old code gone
    Failure Indicators: Any non-zero exit code on steps 1-5, any non-zero count on steps 6-7
    Evidence: .sisyphus/evidence/task-5-full-verification.txt
  ```

  **Commit**: NO (verification only)

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun run build` in packages/deja-client. Review `src/client.ts` for: `as any`/`@ts-ignore`, manual type definitions, server-only imports, positional wrapper methods. Check dist/ bundle excludes drizzle/libsql/huggingface. Verify Effect.Service uses `effect:` not `scoped:`.
  Output: `Build [PASS/FAIL] | Types [PASS/FAIL] | Bundle [CLEAN/ISSUES] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start deja server from clean state. Execute smoke test: `cd packages/deja-client && bun test`. Verify the test actually hits the server and round-trips data (not just type-checking). Check test output for real assertion results.
  Output: `Smoke Test [PASS/FAIL] | Server Started [YES/NO] | Round-trips [N verified] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify nothing in `src/domain.ts`, `src/errors.ts`, `src/security.ts`, `src/*/api.ts`, `src/*/live.ts` was modified. Verify no Promise wrapper or positional convenience methods exist. Verify old manual type definitions are fully deleted. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Server Files [UNTOUCHED/MODIFIED] | Old Code [DELETED/REMAINING] | VERDICT`

---

## Commit Strategy

- **Single commit**: `refactor(client): rewrite deja-client with HttpApiClient for automatic type derivation`
  - Files: `src/client.ts`, `packages/deja-client/src/index.ts`, `packages/deja-client/package.json`, `packages/deja-client/tsconfig.json`, `packages/deja-client/README.md`, `packages/deja-client/test/client.test.ts`
  - Pre-commit: `cd packages/deja-client && bun run build && bun test`

---

## Success Criteria

### Verification Commands
```bash
# Type checking passes
tsc --noEmit                                    # Expected: exit 0

# Client package builds
cd packages/deja-client && bun run build        # Expected: exit 0, dist/ populated

# Bundle is clean of server deps
grep -rl 'drizzle\|libsql\|huggingface' packages/deja-client/dist/  # Expected: no matches

# Smoke test passes
cd packages/deja-client && bun test             # Expected: exit 0
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build succeeds
- [ ] Smoke test passes
- [ ] Bundle tree-shaken (no server deps)
