# Effect Migration - Issues & Gotchas

## Metis-Identified Risks

### Vector SQL Must Use unsafe()
@effect/sql-drizzle/Sqlite uses sqlite-proxy — vector ops (vector32, vector_distance_cos) 
MUST use SqlClient.unsafe(), not drizzle query builder.

### Schema vs Domain
- src/schema.ts = Drizzle table definitions (KEEP as-is)
- src/domain.ts = Effect Schema types for API (NEW file)
These are separate concerns — don't confuse.

### filterScopesByPriority Logic
Priority: session:* > agent:* > shared
Return first group that has matches; if none, return scopes.includes('shared') ? ['shared'] : []
This logic MUST be preserved exactly.

### Inject Error Swallowing
inject() must return { prompt: '', learnings: [] } on error (not throw).
This is intentional backward compat behavior.

### MCP 204 Responses
notifications/initialized and notifications/cancelled → 204 No Content (no body).
Need raw HttpServerResponse in handler, not typed response.

### Port from Config
BunHttpServer.layer({ port }) needs port at construction time.
May need Effect.gen + Config.integer to read before constructing layer.

### DELETE /learnings Validation
Must return 400 if no filter params provided. Handle in handler, not repo.
Repo just does the delete; handler validates filters exist.

### State Events Payload
POST /state/:runId/events: if body.payload exists use it, otherwise use whole body.
src/index.ts:846 has this exact logic.

### Task 8 Typecheck Scope
- `bunx tsc --noEmit` still fails project-wide due pre-existing legacy/index/test errors unrelated to learnings migration files.
- Validation for this task uses two checks:
  1) no `error TS` lines for `src/learnings/*` in compiler output,
  2) `lsp_diagnostics` clean (error severity) for `src/learnings/repo.ts` and `src/learnings/live.ts`.

### Task 12 Handler Typing/Lint Gotchas
- `exactOptionalPropertyTypes` rejects object literals that include `undefined` values for optional keys.
  Build MCP filter/options objects via mutable object + conditional assignment.
- Biome `lint/correctness/noSwitchDeclarations` errors if `const` declarations appear in bare `case` branches.
  Wrap those cases with `{ ... }` blocks.
