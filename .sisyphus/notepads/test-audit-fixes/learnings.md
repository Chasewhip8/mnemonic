# Learnings — test-audit-fixes

## Initial State
- Test dir: `test/mnemonic.test.ts` (17 tests, 1 failing), `test/environment.js`
- `vitest.config.ts`: minimal config, no pool settings
- Plan: 8 implementation tasks + 4 final verification agents
- Evidence dir: `.sisyphus/evidence/`

## [2026-02-24] Task 1: Helpers Extracted
- test/helpers.ts exports: RunningServer type, STARTUP_TIMEOUT_MS, TEST_TIMEOUT_MS, REQUIRED_LD_LIBRARY_PATH, API_KEY, mergedLdLibraryPath, removeDbArtifacts, waitForServer, stopServer, startServer, httpJson (with optional apiKey in options), asRecord, asArray, parseMcpToolResult, parseMcpError, unique, memoryScope
- httpJson signature: options.apiKey overrides default API_KEY for auth header
- parseMcpError: extracts { code, message } from body.error
- vitest config: pool: 'forks', poolOptions.forks.singleFork: true — prevents port conflicts
- Baseline: 16 pass, 1 fail (auth rejection test fails — expects 401, gets 200)
- State endpoints: record actual status codes from diagnostic run

## [2026-02-24] Task 7: Negative/Error Paths
- test/negative.test.ts created, port 8794
- Missing required fields returns 400
- Nonexistent learning delete is idempotent (returns 200 {success:true})
- Wrong API key returns 401
- POST /cleanup with confidence<0.3 learning: learning is deleted

## [2026-02-24] Task 2: Auth + State Assertions
- Auth test was already passing (17/17) — security.ts correctly enforces bearer token
- State assertions changed from permissive [200,500] to strict toBe(200)
- All 17 tests pass after changes

## [2026-02-24] Task 4: Secrets Extended
- test/secrets-extended.test.ts created, port 8791
- Upsert confirmed: POST with same name+scope overwrites value (ON CONFLICT DO UPDATE)
- 404 for non-existent secret confirmed
- Scope priority: session:X beats shared
- GET /secrets (no scope) returns all secrets

## [2026-02-24] Task 5: State Extended
- test/state-extended.test.ts created, port 8792
- GET non-existent state returns 404 confirmed
- Revision increments correctly: PUT=1, PATCH=2, PATCH=3
- Patches accumulate (merge semantics)
- Double-resolve: second resolve also returns 200 (no error)
- persistToLearn=false: no learning created

## [2026-02-24] Task 3: Learnings Extended
- test/learnings-extended.test.ts created, port 8790
- not_recalled_in_days: uses COALESCE(lastRecalledAt, createdAt) < cutoff SQL logic
- scope priority: inject returns only highest-priority scope results (session > agent > shared)
- format:'learnings' returns empty prompt + populated learnings array
- recall tracking: last_recalled_at updated after inject call

## [2026-02-24] Task 6: MCP Tools
- test/mcp-tools.test.ts created, port 8793
- All 13 MCP tools covered
- Error codes: -32600 invalid request, -32601 method not found, -32603 tool error
- GET /mcp returns info with name:'mnemonic' and 13 tools
- notifications/initialized returns 204
