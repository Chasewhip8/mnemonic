# Effect Migration - Architectural Decisions

## Key Decisions

### Effect.Service over Context.Tag
Use `Effect.Service` pattern for V4 forward-compatibility.
`Context.Tag` migration is more structural in V4; `Effect.Service` → `ServiceMap.Service` is trivial rename.

### No `dependencies` option
Skip `dependencies` option on `Effect.Service` — removed in V4.
Use explicit `Layer.provide` instead.

### DDL Initialization
Run all CREATE TABLE IF NOT EXISTS + ALTER TABLE in Database layer construction.
NOT drizzle-kit migrate. Preserves backward compat.

### Vector Operations
Use `SqlClient.unsafe()` for ALL vector SQL (vector32, vector_distance_cos).
@effect/sql-drizzle/Sqlite uses sqlite-proxy, NOT drizzle-orm/libsql — vectors MUST be unsafe().

### Error Handling Semantics
Several methods SWALLOW errors (log + return empty):
- inject, injectTrace, query, getLearnings, getStats (learnings)
- getSecret, setSecret, deleteSecret (secrets)
Preserve this behavior exactly via Effect.catchAll returning defaults.

### MCP Confidence Default
- REST learn: confidence default = undefined (service.learn uses 0.5 as default)
- MCP learn: confidence default = 0.8 (explicitly specified in MCP handler)

### Embedding Vectors
Store as JSON.stringify(number[]) — NOT Float32Array — in DB.
vector32(?) function accepts this format.

### State JSON
Parse stored state_json via JSON.parse() — do NOT validate with Schema.

### Secrets ON CONFLICT Bug
Preserve bug: ON CONFLICT(name) ignores scope — intentional, user said no schema changes.

### Auth Behavior
When API_KEY env is unset → all routes accessible (no auth enforced).
When set → compare bearer token using Redacted.getEquivalence(Equivalence.string).

### Task 8 Learnings Repo/Live
- Keep `LearningsRepo` methods as Effect-returning functions with repository-level behavior parity to `src/service.ts`.
- Keep vector SQL in raw `SqlClient.unsafe()` form; Drizzle query builder is only used for non-vector CRUD/update.
- `getStats` returns scoped learnings counts in array form (`[{ scope, count }]`) to match current `domain.ts` schema.
- Provide a composed live layer export (`LearningsRepoLive`) by piping `LearningsRepo.Default` through `EmbeddingService.Default`, `DatabaseLive`, and `AppConfig.Default`.

### Task 12 MCP Response Boundary
- Keep `handleMcpRequest` transport-agnostic by returning `null` for notifications.
- Convert notification `null` to HTTP 204 in `mcp/live.ts` with `HttpServerResponse.empty({ status: 204 })`.
