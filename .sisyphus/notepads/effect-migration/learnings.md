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
