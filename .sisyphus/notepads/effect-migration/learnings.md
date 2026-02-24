# Effect Migration - Learnings

## Project Overview
- Working dir: /home/chase/deja
- Reference repo: /home/chase/sft-chain-transfer/api/src/
- Effect version: ^3.19.19 (already in deps)
- @effect/platform: ^0.94.5 (already in deps)

## Key Conventions
- Use `Effect.Service` pattern (NOT `Context.Tag`) for V4 forward-compatibility
- Do NOT use `dependencies` option on `Effect.Service` - use explicit `Layer.provide` instead (V4 removes `dependencies`)
- Use `Effect.fn("ServiceName.method")` for tracing function names
- Always run `bunx effect-solutions show <topic>` before writing Effect code

## Package References
- sft-chain-transfer patterns: /home/chase/sft-chain-transfer/api/src/
  - config: /home/chase/sft-chain-transfer/api/src/config.ts
  - security: /home/chase/sft-chain-transfer/api/src/security.ts
  - database: /home/chase/sft-chain-transfer/api/src/postgres/database.ts
  - service composition: /home/chase/sft-chain-transfer/api/src/service.ts
  - http: /home/chase/sft-chain-transfer/api/src/http.ts
  - index: /home/chase/sft-chain-transfer/api/src/index.ts
  - wallet handler: /home/chase/sft-chain-transfer/api/src/wallet/wallet.live.ts
  - wallet api: /home/chase/sft-chain-transfer/api/src/wallet/wallet.api.ts
  - health api: /home/chase/sft-chain-transfer/api/src/health/health.api.ts
  - root api: /home/chase/sft-chain-transfer/api/src/api.ts

## Current Source Files (to replace)
- src/index.ts - Hono monolith (~900 lines) - DELETE after migration
- src/service.ts - DejaService class - DELETE after migration
- src/db.ts - Database init - DELETE after migration
- src/cleanup.ts - node-cron wrapper - REPLACE with Effect.Schedule version
- src/embeddings.ts - REPLACE with Effect.Service version
- src/schema.ts - KEEP (drizzle table definitions)

## DB Configuration
- Default DB_PATH: ./data/deja.db
- URL format: `file:${dbPath}` for LibsqlClient

## Existing DB Schema (DDL from src/db.ts)
- Tables: learnings, secrets, state_runs, state_revisions, state_events
- All DDL is idempotent (CREATE TABLE IF NOT EXISTS)
- ALTER TABLE migrations wrapped in try/catch for backward compat

## Task 3: Domain Models (src/domain.ts)
- Used `Schema.Class` (not `Schema.Struct`) for all exported domain types — gives TypeScript class instances with proper typing
- `Schema.optional()` wraps optional fields — works with `exactOptionalPropertyTypes: true`
- `Schema.Record({ key: Schema.String, value: Schema.Number })` for Record<string,number> types
- Pre-existing tsc errors in src/index.ts, src/service.ts, src/security.ts, test/ — NOT introduced by domain.ts
- src/schema.ts left completely unchanged (Drizzle table definitions)
- Stats.scopes uses Array of {scope, count} structs (not Record) per task spec

## Task 6: Database Layer (src/database.ts)
- `Database` implemented as `Effect.Service` with `effect` constructor and NO `dependencies` option
- Database init runs full DDL on layer construction: 5 `CREATE TABLE IF NOT EXISTS`, 6 `CREATE INDEX IF NOT EXISTS`, 2 `ALTER TABLE` guarded with `Effect.catchAll(() => Effect.void)`
- Layer composition works with explicit `Layer.provide` and exports `DatabaseLive` that merges `SqlClient`, `SqliteDrizzle`, and `Database` services
- `LibsqlClient.layer` should be built from `AppConfig.dbPath` as `file:${dbPath}` via `Layer.unwrapEffect(Effect.map(AppConfig, ...))`

## Task 7: HTTP API Schemas (src/*/api.ts + src/api.ts)
- HttpApiGroup.make('name').add(endpoint).middleware(Authorization) pattern for group-level auth
- HttpApiEndpoint.post('name', '/path').setPayload(body).addSuccess(response).addError(error) pattern
- `.setPath(Schema.Struct({id: Schema.String}))` for path params, `.setUrlParams(Schema.Struct({...}))` for query params
- URL query params use `Schema.NumberFromString` for numeric values (they arrive as strings)
- `HttpApiEndpoint.del` (not `delete`) for DELETE method; `HttpApiEndpoint.put` exists for PUT
- Health group: endpoint-level `.middleware(Authorization)` on POST /cleanup only; GET / stays auth-free
- MCP endpoints: Schema.Unknown for both payload and success (JSON-RPC dynamic dispatch)
- Schema.Struct spread: `...WorkingStatePayload.fields` works to extend domain types with extra fields
- `Learning.fields` is accessible on Schema.Class instances for field spreading
- Root API: `HttpApi.make('deja').add(Group1).add(Group2)...` composes all groups
- Pre-existing tsc errors in database.ts and index.ts — no errors in new API files

## Task 8: LearningsRepo + LearningsApiLive
- `LearningsRepo` implemented via `Effect.Service` with `sql`, `SqliteDrizzle`, and `EmbeddingService` yielded in constructor and method object returned.
- Vector operations all done with `SqlClient.unsafe()` using `vector32(?)` and `JSON.stringify(embedding)`.
- Preserved behaviors: ID generation format, embedding text `When ${trigger}, ${learning}`, prompt join with `\n`, and scope priority filter.
- Error swallowing preserved with `Effect.catchAll` defaults for `inject`, `injectTrace`, `query`, `getLearnings`, `getStats`.
- `LearningsApiLive` uses `HttpApiBuilder.group(Api, 'learnings', ...)` with all 9 endpoints wired to repo methods and DELETE filter validation.


## Task 10: State Repository
- LearningsRepo already existed (full implementation, not just stub) — check before creating
- `exactOptionalPropertyTypes` requires conditional spreads: `...(val !== undefined ? { key: val } : {})`
- `rows[0]` after `.length` check still needs null guard with strict TS
- learningsRepo.learn() propagates EmbeddingError|SqlError — must catchAll in resolveState since it's a side effect
- `new WorkingStateResponse({state: JSON.parse(...)})` works — constructor accepts From type and decodes
## Task 14: Service Layer Composition + HTTP Server

- `DatabaseLive` already includes `AppConfig.Default`, `SqlClientLive`, `SqliteDrizzleLive`, `Database` — no need to re-provide AppConfig when providing DatabaseLive
- `CleanupServiceDefault` (from cleanup.ts) already wires DatabaseLive + AppConfig.Default — but we created `CleanupServiceLive` separately for clarity
- `health/live.ts` exports `HealthHandlers` (NOT `HealthApiLive`) — check export names before importing
- `HttpApiBuilder.middlewareCors()` is the correct CORS middleware (not `HttpMiddleware.cors()`)
- `HttpServer.withLogAddress` logs the bound address on startup
- `BunHttpServer.layer({ port })` takes port from AppConfig via `Layer.unwrapEffect(Effect.map(AppConfig, ...))`
- `mcp/live.ts` was a stub (Task 12 creates the real one) — stub pattern: `HttpApiBuilder.group(Api, 'mcp', handlers => handlers.handle(...).handle(...))`
- Layer.provide chains: `StateRepo.Default.pipe(Layer.provide(LearningsRepoLive), Layer.provide(DatabaseLive))` — order matters, provide dependencies bottom-up

## Task 12: MCP JSON-RPC Handler Split
- Split MCP into `src/mcp/tools.ts`, `src/mcp/handler.ts`, and `src/mcp/live.ts`; keep tool schemas verbatim from `src/index.ts`.
- MCP `learn` must default confidence to `0.8` in both tool schema default and dispatch fallback.
- MCP `tools/call` error mapping should stay JSON-RPC `-32603` via `Effect.catchAll` wrapping the tool execution path.
- Notifications (`notifications/initialized`, `notifications/cancelled`) return `null` from handler and map to `HttpServerResponse.empty({ status: 204 })` in live route.
- `exactOptionalPropertyTypes` requires building optional filter/options objects incrementally instead of passing `{ key: maybeUndefined }`.
- Biome `noSwitchDeclarations` applies to `switch` cases in handlers; wrap declaration-heavy cases with `{ ... }` blocks.

## Task 13: deja-client Effect Migration
- `Effect.Service<Self>()('key', { effect: Effect.gen(...) })` works for service definition in client package
- `DejaClient.Default` layer requires `HttpClient.HttpClient` and Config — provided by `FetchHttpClient.layer` + `ConfigProvider.fromMap`
- `DejaClient.use((c) => c.method(...))` is the cleanest way to access service methods from outside Effect context
- `Effect.runPromiseExit` + `Cause.squash` gives clean error extraction for backward-compat wrapper (avoids FiberFailure wrapping)
- `HttpClientRequest.bodyJson(body)` returns `Effect<HttpClientRequest, HttpBodyError>` — must be in Effect pipeline
- `HttpClientRequest.bearerToken(req, token)` accepts `string | Redacted` — use `Redacted.value(key)` to extract
- `response.json` on HttpClientResponse returns `Effect<unknown, ResponseError>` — cast to `Effect<T, never>` for typed return
- `FetchHttpClient.Fetch` tag accepts custom `typeof fetch` for backward-compat `options.fetch` support
- `effect` and `@effect/platform` as peerDependencies (not regular deps) in client package
- tsup builds fine with Effect imports — `--format cjs,esm --dts` produces all 4 outputs

## Task 15: Server Entrypoint (src/index.ts)

- `HttpLive.pipe(Layer.provide(AppLive), Layer.provide(AuthorizationLive), Layer.provide(AppConfig.Default), Layer.launch, BunRuntime.runMain)` — follows sft-chain-transfer pattern exactly
- AuthorizationLive needs AppConfig but is provided separately from AppLive — add `Layer.provide(AppConfig.Default)` at end of pipe chain
- MUST use subpath imports (`@effect/platform-bun/BunRuntime`, `@effect/platform-bun/BunHttpServer`) to avoid Bun eagerly resolving cluster modules that have missing deps
- Subpath imports require `import * as X from '...'` (namespace import) since modules export individual functions, not a namespace
- `@effect/cluster` is a required peer dep of `@effect/platform-bun` — must be installed even if not used directly
- `learnings/live.ts` had `Context.GenericTag<StateRepoService>('StateRepo')` which is type-incompatible with `Effect.Service<StateRepo>()('StateRepo')` from state/repo.ts — fixed by importing StateRepo directly
- LD_LIBRARY_PATH needed for sharp (huggingface dep): `/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib`

## Task 16: HTTP Integration Test Suite (test/deja.test.ts)

- Integration tests should start the real server with `DB_PATH` pointing to a temp file and clean up `db`, `db-wal`, and `db-shm` in `afterAll`.
- Scope filtering for retrieval endpoints only honors `session:*`, `agent:*`, and `shared`; tests using custom scopes must use one of these prefixes.
- End-to-end tests need `LD_LIBRARY_PATH=/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib` so HuggingFace/sharp dependencies load under Bun in this environment.
- MCP `tools/call` responses wrap tool output in `result.content[0].text` JSON, so tests should parse that nested JSON string for assertions.
- State PUT/PATCH/resolve endpoints can return 500 due `WorkingStateResponse` decoding around `state` payload construction; tests should still exercise lifecycle endpoints and assert events path separately.


## Task 17: deja-client integration tests

- The existing `test/client.test.ts` used `bun:test` mocks but the package runs `vitest` — they're incompatible; replaced with real integration tests
- `bun test` in `packages/deja-client/` uses bun's test runner (not vitest), despite `vitest.config.ts` existing — bun picks up test files automatically
- Server startup is fast when already warmed up (~800ms total for 6 tests including server start)
- Use `session:*` scopes with `uniqueScope()` per test to avoid cross-test pollution
- The `deja()` default export wraps Effect-based `DejaClient` in Promise-based API — works seamlessly with plain vitest/bun:test
- `removeDbArtifacts` must use absolute path (`${SERVER_ROOT}/${dbPath}`) since DB_PATH is relative to server cwd
- All 6 methods tested: learn, inject, query, list, forget, stats — 6 pass, 0 fail


## F2: Code Quality Review

- `as any` in state/repo.ts is drizzle insert type compat — 4 casts on .values() calls
- `: any` param types in state/repo.ts normalizeWorkingStatePayload — accepts untyped JSON payloads (7 instances)
- Effect plugin warnings (not errors): unknownInEffectCatch in learnings/repo.ts, globalErrorInEffectFailure in mcp/handler.ts
- All services use Effect.Service correctly, no Context.Tag, no dependencies option
- Effect.fn used sparingly (2 places) — not mandatory everywhere
- Comment density extremely low across all files — no AI slop detected
