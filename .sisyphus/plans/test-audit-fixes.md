# Integration Test Audit: Fix Bugs + Comprehensive Coverage

## TL;DR

> **Quick Summary**: Fix 1 failing auth test + 4 over-permissive state assertions, then add ~30 new integration tests covering all 13 MCP tools, bulk delete filters, scope priority logic, recall tracking, inject variations, secrets edge cases, state edge cases, error/negative paths, and the cleanup endpoint. Zero mocks — all real server integration.
> 
> **Deliverables**:
> - Fixed auth rejection test (investigate root cause, fix server or test)
> - Strict state assertions (no more accepting 500 as passing)
> - Extracted shared test helpers (`test/helpers.ts`)
> - 5 new test files covering all identified gaps
> - Full suite passes with 45+ tests, 0 failures
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 → T2 → T8 (diagnostic → fixes → verification)

---

## Context

### Original Request
Audit and ensure the integration tests are accurate and enough to catch most bugs and breaking changes. Comprehensive audit. Never mock anything.

### Interview Summary
**Key Discussions**:
- Auth test failure: user wants root cause investigated and fixed
- State permissive assertions: user wants strict (no accepting 500)
- MCP coverage: user wants all 13 tools tested (currently 2/13)
- Negative tests: user wants error path coverage (400, 404, validation errors)

**Audit Findings**:
- 2 test files: `test/deja.test.ts` (17 tests, 1 failing), `packages/deja-client/test/client.test.ts` (6 tests)
- Auth rejection test expects 401, gets 200 — auth enforcement may be broken
- 4 state assertions accept HTTP 500 as passing — masks server crashes
- 11/13 MCP tools have zero coverage via `/mcp` endpoint
- Zero tests for: bulk delete `not_recalled_in_days` filter, scope priority logic, recall tracking, inject `format:'learnings'`, inject `includeState`, secret upsert, secret 404, cleanup endpoint, most error paths

### Metis Review
**Identified Gaps** (addressed):
- Diagnostic step needed BEFORE fixing — run tests to capture actual status codes from state endpoints
- Single shared server preferred, but per-file servers acceptable with sequential vitest config
- Need `parseMcpError` helper for MCP error response tests (different shape than success)
- Don't test `format:'learnings'` via MCP — handler hardcodes `'prompt'`, only test via REST
- `forget_bulk` with zero filters silently returns empty (no validation) — behavioral discrepancy to document
- `state_get` for non-existent runId via MCP returns `null` (not 404) — test actual behavior
- Cleanup endpoint testing limited by server-generated timestamps — test confidence<0.3 cleanup, skip age-based
- Count correction: 11 untested MCP tools (not 10)

---

## Work Objectives

### Core Objective
Fix existing test bugs and expand integration test coverage to catch regressions across the entire API surface — REST endpoints, MCP tools, error paths, and edge cases.

### Concrete Deliverables
- `test/helpers.ts` — shared test server management + HTTP utilities
- Fixed `test/deja.test.ts` — auth test passes, state assertions strict, imports helpers
- `test/learnings-extended.test.ts` — bulk delete, scope priority, recall tracking, inject variations
- `test/secrets-extended.test.ts` — upsert, 404, list without scope
- `test/state-extended.test.ts` — 404, revision tracking, patches, resolve edge cases
- `test/mcp-tools.test.ts` — all 13 MCP tools + error handling + info endpoint
- `test/negative.test.ts` — validation errors, missing fields, 404s, cleanup endpoint
- Updated `vitest.config.ts` — sequential file execution to prevent port conflicts

### Definition of Done
- [ ] `bun vitest --reporter=verbose` → 0 failures, ≥45 tests
- [ ] `grep -c 'expect(\[200' test/deja.test.ts` → 0 (no permissive assertions)
- [ ] Auth rejection test asserts specific 401 status
- [ ] All 13 MCP tools have at least 1 `tools/call` test

### Must Have
- All tests use real server (spawned via `bun run src/index.ts`)
- All tests use real database (libsql file)
- All tests use real embeddings (HuggingFace model)
- Zero mocks, zero stubs, zero fakes
- Each test uses unique scopes/IDs (UUID-based isolation)
- Every `it()` block has explicit timeout (`TEST_TIMEOUT_MS`)

### Must NOT Have (Guardrails)
- No mocking of any kind — not Effect services, not HTTP, not DB, not embeddings
- No `beforeEach`/`afterEach` cleanup — UUID isolation is sufficient
- No changes to `packages/deja-client/test/client.test.ts` — out of scope
- No refactoring of existing passing tests beyond the 4 state assertion fixes + helper extraction
- No `vitest globals: true` — keep explicit imports
- No `@effect/vitest` adoption — it's unused and out of scope
- No dynamic port allocation logic — hardcoded unique ports per file
- No testing `format:'learnings'` via MCP endpoint — handler hardcodes `'prompt'`
- No fixing server-side bugs found during testing (diagnose and document, don't fix)
- If auth bug is a framework-level issue in `@effect/platform`, document it and adjust the test expectation — don't patch Effect internals

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (expanding existing integration suite)
- **Framework**: vitest 3.2.4

### QA Policy
Every task MUST run `bun vitest <file> --reporter=verbose` and verify pass count.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **All tasks**: Use Bash — run vitest, assert pass counts, grep for forbidden patterns
- **Auth investigation**: Use Bash — run specific test, capture server stderr, check response codes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential):
├── Task 1: Diagnostic + extract helpers + vitest config [deep]

Wave 2 (Parallel — bug fixes + new test files):
├── Task 2: Fix auth + state assertions in deja.test.ts [deep]
├── Task 3: test/learnings-extended.test.ts [unspecified-high]
├── Task 4: test/secrets-extended.test.ts [quick]
├── Task 5: test/state-extended.test.ts [unspecified-high]
├── Task 6: test/mcp-tools.test.ts [unspecified-high]
└── Task 7: test/negative.test.ts [unspecified-high]

Wave FINAL (Verification):
└── Task 8: Run full suite + verify completeness [quick]

Critical Path: Task 1 → Task 2 → Task 8
Parallel Speedup: ~60% faster than sequential (6 tasks in Wave 2)
Max Concurrent: 6 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | — | T2, T3, T4, T5, T6, T7 |
| T2 | T1 | T8 |
| T3 | T1 | T8 |
| T4 | T1 | T8 |
| T5 | T1 | T8 |
| T6 | T1 | T8 |
| T7 | T1 | T8 |
| T8 | T2, T3, T4, T5, T6, T7 | — |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `deep`
- **Wave 2**: **6 tasks** — T2 → `deep`, T3 → `unspecified-high`, T4 → `quick`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`
- **Wave FINAL**: **1 task** — T8 → `quick`

---

## TODOs

- [ ] 1. Diagnostic + Extract Test Helpers + Configure Vitest

  **What to do**:
  - Run `bun vitest --reporter=verbose` and capture FULL output including stderr. Record exact status codes from state lifecycle tests (are they 200 or 500?). Record auth rejection test failure details.
  - Create `test/helpers.ts` extracting ALL shared utilities from `test/deja.test.ts`:
    - Types: `RunningServer`
    - Constants: `STARTUP_TIMEOUT_MS`, `TEST_TIMEOUT_MS`, `REQUIRED_LD_LIBRARY_PATH`
    - Functions: `mergedLdLibraryPath`, `removeDbArtifacts`, `waitForServer`, `stopServer`, `startServer`, `httpJson` (parameterize `apiKey` — add optional `apiKey` field to options), `asRecord`, `asArray`, `parseMcpToolResult`, `unique`, `memoryScope`
    - NEW function: `parseMcpError(body)` — extracts `{ code, message }` from JSON-RPC error responses (shape: `{ jsonrpc, id, error: { code, message } }`)
  - Update `vitest.config.ts`: add `pool: 'forks'` and `poolOptions: { forks: { singleFork: true } }` to force sequential test file execution (prevents port conflicts when multiple test files exist)
  - Update `test/deja.test.ts` to import all utilities from `./helpers` instead of defining them inline. Keep test logic unchanged. Remove duplicated function/type/constant definitions.
  - Verify: run `bun vitest test/deja.test.ts --reporter=verbose` — same 16 pass / 1 fail as before (no behavioral change from refactoring)

  **Must NOT do**:
  - Do not fix any test failures in this task — only extract and refactor
  - Do not change any test logic or assertions
  - Do not add new tests
  - Do not modify `packages/deja-client/test/client.test.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful refactoring of shared utilities without breaking existing tests, plus diagnostic analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: T2, T3, T4, T5, T6, T7
  - **Blocked By**: None (starts immediately)

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:1-192` — All shared utilities to extract (types, constants, functions)
  - `test/deja.test.ts:193-206` — beforeAll/afterAll pattern that stays in test file
  - `packages/deja-client/test/client.test.ts:19-52` — Similar helpers (for reference only, do NOT modify)

  **API/Type References**:
  - `vitest.config.ts` — Current config to update with pool settings

  **External References**:
  - Vitest docs: pool configuration for sequential file execution

  **WHY Each Reference Matters**:
  - Lines 1-192 of deja.test.ts contain every function that needs extraction — the boundary between "shared utility" and "test-specific code" is at line 192 (where beforeAll starts)
  - The client test has similar helpers showing what other files will need to import
  - vitest pool config prevents port conflicts when multiple test files share ports sequentially

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Helpers extracted without breaking existing tests
    Tool: Bash
    Preconditions: Clean working tree
    Steps:
      1. Run: bun vitest test/deja.test.ts --reporter=verbose 2>&1
      2. Count passing tests in output
      3. Verify 16 passed, 1 failed (same as baseline)
      4. Verify test/helpers.ts exists and exports: startServer, stopServer, httpJson, asRecord, asArray, parseMcpToolResult, parseMcpError, unique, memoryScope
      5. Verify test/deja.test.ts imports from './helpers'
      6. Grep test/deja.test.ts for duplicated function definitions (should find none that exist in helpers)
    Expected Result: 16 passed, 1 failed. helpers.ts exists with all exports. deja.test.ts imports from helpers.
    Failure Indicators: Different pass/fail count than baseline. Missing exports from helpers.ts. Duplicated definitions remain in deja.test.ts.
    Evidence: .sisyphus/evidence/task-1-helpers-extracted.txt

  Scenario: Vitest config updated for sequential execution
    Tool: Bash
    Preconditions: vitest.config.ts exists
    Steps:
      1. Read vitest.config.ts
      2. Verify pool: 'forks' is set
      3. Verify poolOptions.forks.singleFork: true is set
    Expected Result: Config has sequential execution settings
    Evidence: .sisyphus/evidence/task-1-vitest-config.txt

  Scenario: parseMcpError helper works correctly
    Tool: Bash
    Preconditions: test/helpers.ts exists
    Steps:
      1. Verify parseMcpError function is exported
      2. Verify it extracts { code, message } from JSON-RPC error shape
    Expected Result: Function exists and handles error response shape
    Evidence: .sisyphus/evidence/task-1-mcp-error-helper.txt
  ```

  **Commit**: YES
  - Message: `test: extract shared helpers and configure sequential vitest execution`
  - Files: `test/helpers.ts`, `test/deja.test.ts`, `vitest.config.ts`
  - Pre-commit: `bun vitest test/deja.test.ts --reporter=verbose`

- [ ] 2. Fix Auth Rejection Test + State Assertion Strictness

  **What to do**:
  - **Auth investigation**: The test `auth rejected (no bearer -> 401)` expects 401 but gets 200.
    1. Read `src/security.ts` — understand how `HttpApiSecurity.bearer` + `AuthorizationLive` work
    2. Run the server manually with API_KEY set, make an unauthenticated curl request to /stats, observe response
    3. Check if `@effect/platform`'s `HttpApiSecurity.bearer` skips middleware when no Authorization header is present (vs calling it with empty token)
    4. If it's a framework behavior (bearer security doesn't enforce header presence): update the test to match actual behavior, add a comment explaining the framework limitation
    5. If it's a server bug (middleware not applied correctly): fix `src/security.ts` or the API group middleware wiring
    6. If auth IS enforced but on different endpoints: verify which endpoints require auth and update test accordingly
  - **State assertions**: Change all 4 over-permissive assertions to strict:
    - Line 545: `expect([200, 500]).toContain(putState.status)` → `expect(putState.status).toBe(200)`
    - Line 551: `expect([200, 404, 500]).toContain(getState.status)` → `expect(getState.status).toBe(200)`
    - Line 564: `expect([200, 500]).toContain(patchState.status)` → `expect(patchState.status).toBe(200)`
    - Lines 601, 615: Same pattern in `state resolve` test → strict 200
  - Verify state tests still pass with strict assertions (T1 diagnostic should confirm endpoints return 200)

  **Must NOT do**:
  - Do not patch `@effect/platform` internals
  - Do not add new tests (only fix existing)
  - Do not change other passing tests beyond the 4 state assertions
  - If auth bug requires server code change, make minimal change only to security.ts

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Auth investigation requires understanding Effect HttpApi security middleware behavior + debugging actual HTTP responses
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3-T7, modifies different files)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/security.ts:1-45` — Full auth middleware implementation. `AuthorizationLive` creates bearer token validator. When `API_KEY` is unset, returns `Effect.void` (passthrough). When set, compares with `Redacted.getEquivalence`.
  - `src/learnings/api.ts:136` — `.middleware(Authorization)` applied at group level for all learning endpoints
  - `src/secrets/api.ts:58` — `.middleware(Authorization)` applied at group level for all secret endpoints
  - `src/health/api.ts:16-26` — HealthApi group: `GET /` has NO auth, `POST /cleanup` has per-endpoint auth

  **API/Type References**:
  - `test/deja.test.ts:545,551,564,601,615` — The 4-5 lines with permissive `expect([200, 500])` assertions to fix
  - `test/deja.test.ts:751-756` — The failing auth rejection test

  **External References**:
  - `@effect/platform` HttpApiSecurity.bearer — understand when middleware is invoked vs skipped

  **WHY Each Reference Matters**:
  - security.ts shows the auth logic is straightforward IF the middleware is called — the question is whether Effect calls it for missing headers
  - The API files show middleware is applied at group level, confirming auth should be enforced
  - The health API shows intentional unauthenticated endpoint (GET /) for comparison

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auth rejection test passes
    Tool: Bash
    Preconditions: T1 complete, helpers extracted
    Steps:
      1. Run: bun vitest test/deja.test.ts -t 'auth rejected' --reporter=verbose 2>&1
      2. Check test result
    Expected Result: Test passes (either 401 is correctly returned, or test updated to match actual framework behavior with explanatory comment)
    Failure Indicators: Test still fails
    Evidence: .sisyphus/evidence/task-2-auth-fix.txt

  Scenario: State assertions are strict
    Tool: Bash
    Preconditions: T1 diagnostic confirmed state endpoints return 200
    Steps:
      1. Run: grep -n 'expect(\[200' test/deja.test.ts
      2. Verify 0 matches
      3. Run: bun vitest test/deja.test.ts -t 'state lifecycle' --reporter=verbose 2>&1
      4. Verify both state tests pass
    Expected Result: Zero permissive assertions. Both state tests pass with strict 200 checks.
    Failure Indicators: grep finds matches. State tests fail (would mean endpoints actually return 500 — escalate).
    Evidence: .sisyphus/evidence/task-2-state-strict.txt

  Scenario: Full existing suite still works
    Tool: Bash
    Steps:
      1. Run: bun vitest test/deja.test.ts --reporter=verbose 2>&1
      2. Verify 17 passed, 0 failed
    Expected Result: All 17 tests pass (including previously failing auth test)
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Commit**: YES
  - Message: `fix: auth rejection test and strict state assertions`
  - Files: `test/deja.test.ts`, possibly `src/security.ts`
  - Pre-commit: `bun vitest test/deja.test.ts --reporter=verbose`

- [ ] 3. Learnings Extended Tests (Bulk Delete, Scope Priority, Recall Tracking, Inject Variations)

  **What to do**:
  Create `test/learnings-extended.test.ts` with its own server on port 8790. Import all helpers from `./helpers`. Tests:

  **Bulk delete filters** (4 tests):
  - `not_recalled_in_days` filter: Create 2 learnings. Inject one to update its `last_recalled_at`. Wait briefly. Bulk delete with `not_recalled_in_days=0` (using a cutoff that catches the non-recalled one). Verify only the non-recalled learning is deleted.
  - `scope`-only filter: Create learnings in 2 different scopes. Bulk delete with `scope=X`. Verify only scope X learnings deleted.
  - Combined filters (`confidence_lt` + `scope`): Create mix of low/high confidence across scopes. Delete with both filters. Verify intersection semantics.
  - No-filter validation: `DELETE /learnings` with no query params. Expect 400 status with validation error message.

  **Scope priority** (3 tests):
  - Session > shared: Create a learning in `session:X` scope and one in `shared`. Inject with `scopes: ['session:X', 'shared']`. Verify only the session-scoped learning is returned (priority filter).
  - Agent > shared: Same pattern with `agent:X` scope.
  - Empty scopes: Inject with `scopes: []`. Verify empty response (no learnings, empty prompt).

  **Recall tracking** (1 test):
  - Create a learning. Call `/inject` with context matching that learning. Then `GET /learnings` and verify the learning's `last_recalled_at` is set (not null) and `recall_count` is >= 1.

  **Inject variations** (2 tests):
  - `format:'learnings'`: POST `/inject` with `format: 'learnings'`. Verify response has empty string for `prompt` and populated `learnings` array.
  - `includeState + runId`: PUT a working state at `/state/run-X`. POST `/inject` with `includeState: true, runId: 'run-X'`. Verify response `prompt` contains state info (e.g., the goal text) and `state` field is populated.

  **Must NOT do**:
  - Do not test `format:'learnings'` via MCP endpoint (handler hardcodes 'prompt')
  - Do not modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios with nuanced setup (recall tracking, scope priority logic)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (separate file from other tasks)
  - **Parallel Group**: Wave 2 (with T2, T4, T5, T6, T7)
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:193-206` — beforeAll/afterAll server lifecycle pattern to replicate (use port 8790, unique DB path)
  - `test/deja.test.ts:350-409` — Existing bulk delete test (confidence_lt) to follow as pattern for new filter tests
  - `test/deja.test.ts:208-246` — learn + inject round-trip pattern to follow

  **API/Type References**:
  - `src/learnings/repo.ts:36-47` — `filterScopesByPriority()` — the exact priority logic being tested: session > agent > shared
  - `src/learnings/repo.ts:128-189` — `inject()` function — updates `lastRecalledAt` and `recallCount` on lines 160-171
  - `src/learnings/repo.ts:428-470` — `deleteLearnings()` — filter logic for `confidence_lt`, `not_recalled_in_days`, `scope`
  - `src/learnings/api.ts:22-29` — `InjectBody` schema showing `format`, `includeState`, `runId` fields
  - `src/learnings/live.ts:43-69` — `maybeAttachState()` function for includeState behavior

  **WHY Each Reference Matters**:
  - `filterScopesByPriority` is the core function being tested for scope priority — understand the exact filtering rules
  - Lines 160-171 of repo.ts show exactly how recall tracking is updated — the test verifies this side effect
  - The deleteLearnings filters show the SQL conditions — `COALESCE(lastRecalledAt, createdAt) < cutoff` for not_recalled_in_days
  - The InjectBody schema confirms which fields the endpoint accepts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All learnings-extended tests pass
    Tool: Bash
    Preconditions: T1 complete, test/helpers.ts exists
    Steps:
      1. Run: bun vitest test/learnings-extended.test.ts --reporter=verbose 2>&1
      2. Count: expect ~10 tests
      3. Verify 0 failures
    Expected Result: 10 tests pass, 0 fail
    Failure Indicators: Any test failure. Server startup failure on port 8790.
    Evidence: .sisyphus/evidence/task-3-learnings-extended.txt

  Scenario: Scope priority correctly filters
    Tool: Bash
    Steps:
      1. In the test output, verify the scope priority tests pass
      2. Verify session-scoped learning is returned when both session and shared exist
    Expected Result: Priority filtering works as expected
    Evidence: .sisyphus/evidence/task-3-scope-priority.txt

  Scenario: No-filter bulk delete returns 400
    Tool: Bash
    Steps:
      1. Verify the no-filter test asserts status 400 (not 200 or 500)
      2. Verify response contains validation error message
    Expected Result: 400 status with 'at least one filter required' message
    Evidence: .sisyphus/evidence/task-3-no-filter-validation.txt
  ```

  **Commit**: YES (groups with T4, T5, T6, T7)
  - Message: `test: add learnings extended coverage (bulk delete, scope priority, recall tracking, inject variations)`
  - Files: `test/learnings-extended.test.ts`
  - Pre-commit: `bun vitest test/learnings-extended.test.ts --reporter=verbose`

- [ ] 4. Secrets Extended Tests

  **What to do**:
  Create `test/secrets-extended.test.ts` with its own server on port 8791. Import all helpers from `./helpers`. Tests:

  - **Upsert behavior** (1 test): POST `/secret` with name=X, value=A, scope=S. POST again with name=X, value=B, scope=S (same name). GET `/secret/X?scopes=S`. Verify value is B (updated, not A).
  - **Get non-existent secret** (1 test): GET `/secret/does-not-exist?scopes=shared`. Expect 404 with error message.
  - **Scope priority in secrets** (1 test): Set secret name=X in `session:Y` scope. Set secret name=X in `shared` scope (different value). GET `/secret/X?scopes=session:Y,shared`. Verify returns the session-scoped value (priority).
  - **List all secrets** (1 test): Create 2 secrets in different scopes. GET `/secrets` (no scope param). Verify both appear.
  - **List after delete** (1 test): Create secret, delete it, list — verify it's gone (existing pattern but in fresh server context).

  **Must NOT do**:
  - Do not modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward CRUD edge case tests with simple setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:494-528` — Existing secrets CRUD test to follow as pattern

  **API/Type References**:
  - `src/secrets/api.ts:1-58` — Full SecretsApi definition: setSecret, getSecret, deleteSecret, listSecrets endpoints + schema
  - `src/secrets/repo.ts:8-19` — `filterScopesByPriority` for secrets — same priority logic as learnings
  - `src/secrets/repo.ts:57-79` — `setSecret` with ON CONFLICT DO UPDATE (upsert logic)
  - `src/secrets/live.ts:15-24` — `getSecret` handler: splits scopes by comma, returns 404 if null

  **WHY Each Reference Matters**:
  - The existing CRUD test shows the httpJson call pattern for secrets
  - repo.ts line 66 shows the SQL ON CONFLICT — confirms upsert is supported at DB level
  - live.ts shows the comma-split of scopes param and 404 handling

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All secrets-extended tests pass
    Tool: Bash
    Steps:
      1. Run: bun vitest test/secrets-extended.test.ts --reporter=verbose 2>&1
      2. Count: expect ~5 tests
      3. Verify 0 failures
    Expected Result: 5 tests pass, 0 fail
    Failure Indicators: Any test failure. 404 test returns wrong status.
    Evidence: .sisyphus/evidence/task-4-secrets-extended.txt

  Scenario: Upsert overwrites value
    Tool: Bash
    Steps:
      1. Verify upsert test sets same name twice with different values
      2. Verify GET returns the second (updated) value
    Expected Result: Second POST overwrites first value
    Evidence: .sisyphus/evidence/task-4-upsert.txt

  Scenario: Non-existent secret returns 404
    Tool: Bash
    Steps:
      1. Verify test GETs a name that was never created
      2. Assert status is 404
    Expected Result: 404 status
    Evidence: .sisyphus/evidence/task-4-secret-404.txt
  ```

  **Commit**: YES (groups with T3, T5, T6, T7)
  - Message: `test: add secrets extended coverage (upsert, 404, scope priority, list all)`
  - Files: `test/secrets-extended.test.ts`
  - Pre-commit: `bun vitest test/secrets-extended.test.ts --reporter=verbose`

- [ ] 5. State Extended Tests

  **What to do**:
  Create `test/state-extended.test.ts` with its own server on port 8792. Import all helpers from `./helpers`. Tests:

  - **GET non-existent state** (1 test): GET `/state/nonexistent-run-id`. Expect 404.
  - **Revision tracking** (1 test): PUT state (rev 1). PATCH state (rev 2). PATCH again (rev 3). GET state. Verify `revision` is 3.
  - **Multiple patches accumulate** (1 test): PUT state with `goal: 'A'`. PATCH with `open_questions: ['Q1']`. PATCH with `next_actions: ['A1']`. GET state. Verify all three fields present (goal, open_questions, next_actions).
  - **Resolve already-resolved state** (1 test): PUT state. Resolve with `persistToLearn: true`. Verify status='resolved'. Resolve again. Verify it doesn't error (observe behavior — may create duplicate learning).
  - **persistToLearn=false** (1 test): PUT state. Resolve with `persistToLearn: false`. GET `/learnings` with matching scope. Verify NO learning was created from the resolve.
  - **Events creation and count** (1 test): PUT state. POST 3 events. Verify each returns `{ success: true, id: <string> }` with unique IDs.

  **Must NOT do**:
  - Do not fix state endpoint bugs if found — document them in evidence output
  - Do not modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: State lifecycle tests require careful sequencing of PUT/PATCH/resolve operations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:531-629` — Existing state lifecycle tests to follow as pattern

  **API/Type References**:
  - `src/state/api.ts:1-78` — Full StateApi: getState, upsertState, patchState, addStateEvent, resolveState
  - `src/state/repo.ts:46-234` — Full StateRepo implementation: getState (returns null if not found), upsertState (revision increment), patchState (merge), resolveState (persistToLearn logic)
  - `src/state/repo.ts:173-224` — `resolveState` — sets status='resolved', optionally creates learning via `learningsRepo.learn()`
  - `src/state/live.ts:9-17` — `getState` handler returns 404 via `NotFoundError` if repo returns null

  **WHY Each Reference Matters**:
  - repo.ts:84 shows revision is `(existing?.revision ?? 0) + 1` — the exact increment logic being tested
  - repo.ts:130-148 shows patchState merges with normalized payload — tests verify accumulation behavior
  - repo.ts:173 shows resolveState doesn't check if already resolved — the double-resolve test documents this behavior
  - live.ts:14 shows the 404 mapping — confirms GET for non-existent runId should return 404

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All state-extended tests pass
    Tool: Bash
    Steps:
      1. Run: bun vitest test/state-extended.test.ts --reporter=verbose 2>&1
      2. Count: expect ~6 tests
      3. Verify 0 failures
    Expected Result: 6 tests pass, 0 fail
    Failure Indicators: Any test failure. 404 test returns wrong status.
    Evidence: .sisyphus/evidence/task-5-state-extended.txt

  Scenario: Non-existent state returns 404
    Tool: Bash
    Steps:
      1. Verify test GETs a runId that was never created
      2. Assert status is 404
    Expected Result: 404 status
    Evidence: .sisyphus/evidence/task-5-state-404.txt

  Scenario: Patches accumulate correctly
    Tool: Bash
    Steps:
      1. Verify test creates state with goal, then patches open_questions, then patches next_actions
      2. Final GET shows all three fields present
    Expected Result: State contains goal + open_questions + next_actions after sequential patches
    Evidence: .sisyphus/evidence/task-5-patches-accumulate.txt
  ```

  **Commit**: YES (groups with T3, T4, T6, T7)
  - Message: `test: add state extended coverage (404, revisions, patches, resolve edge cases)`
  - Files: `test/state-extended.test.ts`
  - Pre-commit: `bun vitest test/state-extended.test.ts --reporter=verbose`


- [ ] 6. MCP Tools Complete Coverage

  **What to do**:
  Create `test/mcp-tools.test.ts` with its own server on port 8793. Import all helpers from `./helpers`. This file tests ALL 13 MCP tools via the `/mcp` JSON-RPC endpoint + error handling + info endpoint.

  **MCP tool tests (11 new tools/call tests):**
  Each test sends a JSON-RPC `tools/call` request and verifies the result.
  - `inject_trace`: Learn a memory, call inject_trace with matching context. Verify response has `candidates` array, `metadata.total_candidates > 0`, `injected` array.
  - `query`: Learn a memory, call query with matching text. Verify `learnings` array contains the learning, `hits` object has scope key.
  - `forget`: Learn a memory, get its ID from response. Call forget with that ID. Verify `{ success: true }`. Call list to confirm it's gone.
  - `forget_bulk`: Create 2 low-confidence learnings. Call forget_bulk with `confidence_lt: 0.5`. Verify `deleted >= 2`.
  - `learning_neighbors`: Create 2 semantically similar learnings. Call learning_neighbors with one's ID. Verify the other appears in results with `similarity_score`.
  - `list`: Create 2 learnings in a scope. Call list with `scope`. Verify array length >= 2.
  - `stats`: Call stats. Verify `totalLearnings` is a number, `totalSecrets` is a number, `scopes` exists.
  - `state_put`: Call state_put with `runId: unique()`, `goal: 'test'`. Verify response has `runId`, `revision: 1`.
  - `state_get`: After state_put, call state_get. Verify returns the state with correct goal.
  - `state_patch`: After state_put, call state_patch with `patch: { open_questions: ['Q1'] }`. Verify revision increments.
  - `state_resolve`: After state_put, call state_resolve with `persistToLearn: true, scope: unique()`. Verify `status: 'resolved'`.

  **MCP error handling (4 tests):**
  - Invalid JSON-RPC version: Send `{ jsonrpc: '1.0', id: 1, method: 'initialize' }`. Expect error response with code -32600.
  - Unknown method: Send `{ jsonrpc: '2.0', id: 1, method: 'unknown/method' }`. Expect error with code -32601.
  - Unknown tool: Send `tools/call` with `name: 'nonexistent_tool'`. Expect error with code -32603.
  - Missing tool name: Send `tools/call` with empty params. Expect error with code -32603.

  **MCP protocol (2 tests):**
  - `notifications/initialized`: Send notification. Expect 204 status (null response handled by server).
  - `GET /mcp` info endpoint: Send GET to `/mcp`. Verify response has `name: 'deja'`, `version`, `tools` array with 13 tool names.

  **Must NOT do**:
  - Do not test `format:'learnings'` via MCP (handler hardcodes 'prompt')
  - Do not modify existing test files
  - Use `parseMcpToolResult` for success responses and `parseMcpError` (from helpers) for error responses

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 17 tests across the full MCP surface area, requiring JSON-RPC protocol understanding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:632-740` — Existing MCP tests showing JSON-RPC request pattern and `parseMcpToolResult` usage
  - `test/deja.test.ts:672-698` — `tools/call learn` test — exact pattern to replicate for other tools
  - `test/deja.test.ts:700-739` — `tools/call inject` test — shows learn-then-inject pattern

  **API/Type References**:
  - `src/mcp/tools.ts:1-259` — All 13 MCP tool definitions with names, descriptions, inputSchemas. Shows required fields for each tool.
  - `src/mcp/handler.ts:109-260` — `dispatchToolCall` switch statement — maps tool names to repo calls. Shows exact parameter mapping.
  - `src/mcp/handler.ts:262-342` — `handleMcpRequest` — shows JSON-RPC routing: initialize, tools/list, tools/call, notifications, default error
  - `src/mcp/live.ts:13-14` — `handleMcp` returns 204 for null result (notifications)

  **WHY Each Reference Matters**:
  - tools.ts defines the exact inputSchema for each tool — required fields, types, defaults
  - handler.ts:109-260 shows parameter extraction logic (`asString`, `asNumber`, `asStringArray`) — the test verifies this dispatch works correctly end-to-end
  - handler.ts:262-342 shows error code mapping: -32600 (invalid request), -32601 (method not found), -32603 (tool error)
  - live.ts:13-14 confirms null responses (notifications) return 204

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 13 MCP tools have coverage
    Tool: Bash
    Steps:
      1. Run: bun vitest test/mcp-tools.test.ts --reporter=verbose 2>&1
      2. Count test names containing 'tools/call'
      3. Verify at least 13 tools/call tests (11 new + 0 from existing file, but verify all tool names present)
      4. Verify 0 failures
    Expected Result: ~17 tests pass (11 tools + 4 error + 2 protocol), 0 fail
    Failure Indicators: Any test failure. Missing tool coverage.
    Evidence: .sisyphus/evidence/task-6-mcp-tools.txt

  Scenario: MCP error responses have correct codes
    Tool: Bash
    Steps:
      1. Verify invalid jsonrpc test asserts error.code === -32600
      2. Verify unknown method test asserts error.code === -32601
      3. Verify unknown tool test asserts error.code === -32603
    Expected Result: Each error case returns correct JSON-RPC error code
    Evidence: .sisyphus/evidence/task-6-mcp-errors.txt

  Scenario: GET /mcp returns info
    Tool: Bash
    Steps:
      1. Verify test sends GET to /mcp
      2. Assert response has name: 'deja' and tools array with 13 entries
    Expected Result: Info endpoint returns correct metadata
    Evidence: .sisyphus/evidence/task-6-mcp-info.txt
  ```

  **Commit**: YES (groups with T3, T4, T5, T7)
  - Message: `test: add complete MCP tool coverage (all 13 tools + error handling + info)`
  - Files: `test/mcp-tools.test.ts`
  - Pre-commit: `bun vitest test/mcp-tools.test.ts --reporter=verbose`

- [ ] 7. Negative / Error Path Tests + Cleanup Endpoint

  **What to do**:
  Create `test/negative.test.ts` with its own server on port 8794. Import all helpers from `./helpers`. Tests:

  **Validation errors (3 tests):**
  - POST `/learn` with missing `trigger` field (only `learning` provided). Expect 400 status.
  - POST `/learn` with missing `learning` field (only `trigger` provided). Expect 400 status.
  - POST `/inject` with empty body `{}`. Expect 400 status (missing `context` field).

  **Not-found errors (3 tests):**
  - GET `/learning/nonexistent-id-xyz/neighbors`. Expect either 200 with empty array (current behavior per repo.ts:355-356) or 404.
  - DELETE `/learning/nonexistent-id-xyz`. Expect 200 with `{ success: true }` (current behavior — delete is idempotent per repo.ts:408-426).
  - GET unknown route `/nonexistent-route`. Expect 404.

  **Auth edge cases (2 tests):**
  - Wrong API key: Set `Authorization: Bearer wrong-key`. Hit `/stats`. Expect 401.
  - Malformed auth header: Set `Authorization: NotBearer token`. Hit `/stats`. Observe behavior (document actual response).

  **Cleanup endpoint (2 tests):**
  - POST `/cleanup` with auth: Verify returns `{ deleted: <number>, reasons: <string[]> }` with 200.
  - POST `/cleanup` to clean low-confidence: Create a learning with `confidence: 0.1`. Call `/cleanup`. Verify it was deleted (the CleanupService deletes confidence < 0.3). Call `/learnings` and confirm the learning is gone.

  **Must NOT do**:
  - Do not modify existing test files
  - Do not fix server bugs found — test ACTUAL behavior and document
  - For cleanup age-based tests (session >7 days, agent >30 days): SKIP these — timestamps are server-generated and can't be backdated through the API. Only test the confidence<0.3 cleanup.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Error path testing requires understanding expected vs actual behavior for each endpoint
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `test/deja.test.ts:742-783` — Existing auth tests to follow as pattern

  **API/Type References**:
  - `src/learnings/api.ts:13-20` — `LearnBody` schema: `trigger` and `learning` are required strings
  - `src/learnings/api.ts:22-29` — `InjectBody` schema: `context` is required string
  - `src/learnings/live.ts:145-175` — `deleteLearnings` handler: returns ValidationError if no filters
  - `src/health/api.ts:21-26` — `POST /cleanup` endpoint with Authorization middleware
  - `src/health/live.ts:9` — cleanup handler calls `CleanupService.runCleanup()`
  - `src/cleanup.ts:72-87` — Cleanup logic: deletes confidence < 0.3
  - `src/errors.ts:32-38` — `ValidationError` with status 400

  **WHY Each Reference Matters**:
  - LearnBody schema shows `trigger` and `learning` are required — omitting either should trigger schema validation
  - cleanup.ts lines 72-87 show the confidence<0.3 threshold — creating a 0.1 confidence learning and running cleanup should delete it
  - errors.ts confirms ValidationError maps to 400 status

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All negative tests pass
    Tool: Bash
    Steps:
      1. Run: bun vitest test/negative.test.ts --reporter=verbose 2>&1
      2. Count: expect ~10 tests
      3. Verify 0 failures
    Expected Result: 10 tests pass, 0 fail
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-negative.txt

  Scenario: Validation errors return 400
    Tool: Bash
    Steps:
      1. Verify missing-trigger test asserts status 400
      2. Verify missing-learning test asserts status 400
      3. Verify empty-inject test asserts status 400
    Expected Result: All validation tests get 400 responses
    Evidence: .sisyphus/evidence/task-7-validation-errors.txt

  Scenario: Cleanup deletes low-confidence learnings
    Tool: Bash
    Steps:
      1. Verify test creates learning with confidence 0.1
      2. Verify test calls POST /cleanup
      3. Verify test confirms learning is deleted from listings
    Expected Result: Confidence 0.1 learning removed after cleanup
    Evidence: .sisyphus/evidence/task-7-cleanup.txt
  ```

  **Commit**: YES (groups with T3, T4, T5, T6)
  - Message: `test: add negative/error path tests and cleanup endpoint coverage`
  - Files: `test/negative.test.ts`
  - Pre-commit: `bun vitest test/negative.test.ts --reporter=verbose`

- [ ] 8. Final Verification — Full Suite Pass

  **What to do**:
  - Run the complete test suite: `bun vitest --reporter=verbose`
  - Verify total test count ≥ 45
  - Verify 0 failures
  - Run coverage checks:
    - `grep -rc 'expect(\[200' test/` — must be 0 (no permissive assertions)
    - `grep -c 'tools/call' test/mcp-tools.test.ts` — must be ≥ 13 (all MCP tools)
    - `grep -rc 'mock\|Mock\|stub\|Stub\|fake\|Fake' test/*.ts` — must be 0 (no mocking)
  - If any failures: investigate root cause, determine if it's a test bug or server bug, fix test bugs, document server bugs
  - Run `tsc --noEmit` to verify no type errors in test files

  **Must NOT do**:
  - Do not add new tests in this task
  - Do not refactor passing tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task, no code changes expected
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave FINAL (solo)
  - **Blocks**: None
  - **Blocked By**: T2, T3, T4, T5, T6, T7

  **References**:

  **Pattern References**:
  - All test files created in T1-T7

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full suite passes
    Tool: Bash
    Steps:
      1. Run: bun vitest --reporter=verbose 2>&1
      2. Capture total test count
      3. Verify 0 failures
      4. Verify test count >= 45
    Expected Result: 45+ tests, 0 failures
    Failure Indicators: Any failure. Test count < 45.
    Evidence: .sisyphus/evidence/task-8-full-suite.txt

  Scenario: No forbidden patterns
    Tool: Bash
    Steps:
      1. Run: grep -rc 'expect(\[200' test/
      2. Run: grep -rc 'mock\|Mock\|stub\|Stub' test/*.ts
      3. Verify both return 0
    Expected Result: Zero permissive assertions, zero mocks
    Evidence: .sisyphus/evidence/task-8-patterns.txt

  Scenario: All 13 MCP tools covered
    Tool: Bash
    Steps:
      1. Run: grep -c 'tools/call' test/mcp-tools.test.ts
      2. Verify count >= 13
    Expected Result: 13+ MCP tool tests
    Evidence: .sisyphus/evidence/task-8-mcp-count.txt

  Scenario: Type check passes
    Tool: Bash
    Steps:
      1. Run: tsc --noEmit 2>&1
      2. Verify exit code 0
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-8-typecheck.txt
  ```

  **Commit**: YES
  - Message: `test: verify full integration suite (45+ tests, 0 failures)`
  - Files: none (verification only, unless fixes needed)
  - Pre-commit: `bun vitest --reporter=verbose`

---
## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (run vitest, check test counts). For each "Must NOT Have": search test files for forbidden patterns (mock, stub, fake, globals:true, beforeEach). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun vitest`. Review all new test files for: hardcoded ports matching plan, unique scope/ID patterns, explicit timeouts on every `it()`, proper server cleanup in `afterAll`. Check no test uses mocks. Check no `expect([200, 500])` patterns.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state (`rm -rf data/test-*`). Execute `bun vitest --reporter=verbose` end-to-end. Verify every test file runs. Count total tests. Check all 13 MCP tools have coverage (grep for tool names in mcp-tools.test.ts). Check negative tests assert specific error codes (not just "is error"). Save output.
  Output: `Scenarios [N/N pass] | Test Count [N] | MCP Tools [13/13] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual files created. Verify 1:1 — everything in spec was built, nothing beyond spec. Check no changes to `packages/deja-client/`. Check no changes to server source code beyond auth fix (if needed). Check no test file spawns more than 1 server. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **After T1**: `test: extract shared helpers and configure sequential vitest execution`
- **After T2**: `fix: auth rejection test and strict state assertions`
- **After T3-T7** (batch): `test: comprehensive coverage for learnings, secrets, state, MCP tools, and error paths`
- **After T8**: `test: verify full suite passes with 45+ integration tests`

---

## Success Criteria

### Verification Commands
```bash
bun vitest --reporter=verbose  # Expected: 0 failures, ≥45 tests
grep -rc 'expect(\[200' test/  # Expected: 0 matches
grep -c 'tools/call' test/mcp-tools.test.ts  # Expected: ≥13
grep -c 'mock\|Mock\|stub\|Stub\|fake\|Fake' test/*.ts  # Expected: 0
```

### Final Checklist
- [ ] All "Must Have" present (real server, real DB, real embeddings, zero mocks, unique IDs, timeouts)
- [ ] All "Must NOT Have" absent (no mocks, no beforeEach, no globals, no client test changes)
- [ ] Auth rejection test passes with correct status assertion
- [ ] No permissive `expect([200, 500])` patterns remain
- [ ] All 13 MCP tools covered
- [ ] Negative/error paths covered (400, 404, validation errors)
- [ ] Full suite: 0 failures
