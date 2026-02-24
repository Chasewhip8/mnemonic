# Learnings — mnemonic-client-rewrite

## [2026-02-24] Atlas: Codebase Research

### Project Structure
- Root: `/home/chase/mnemonic/` — root tsconfig covers `src/**/*` and `test/**/*` only, `"noEmit": true`
- Server API: `src/api.ts` — exports `Api` class (extends HttpApi.make('mnemonic').add(LearningsApi).add(SecretsApi).add(StateApi).add(HealthApi))
- Domain: `src/domain.ts` — Schema.Class types: Learning, Secret, WorkingStatePayload, WorkingStateResponse, InjectResult, InjectTraceResult, QueryResult, Stats
- Errors: `src/errors.ts` — TaggedError types: DatabaseError, EmbeddingError, NotFoundError, Unauthorized, ValidationError
- Security: `src/security.ts` — `Authorization` HttpApiMiddleware.Tag using `HttpApiSecurity.bearer`. Imports from `./config` (AppConfig) — don't import this in client!

### API Groups and Endpoints (20 total)
**learnings** (9 endpoints): learn, inject, injectTrace, query, getLearnings, deleteLearnings, deleteLearning, getLearningNeighbors, getStats
**state** (5 endpoints): getState, upsertState, patchState, addStateEvent, resolveState
**secrets** (4 endpoints): setSecret, getSecret, deleteSecret, listSecrets
**health** (2 endpoints): healthCheck, cleanup

### Current Client Package
- `packages/mnemonic-client/src/index.ts` — 257 lines, manual type interfaces, Promise wrapper `mnemonic()`, only 6/20 endpoints
- `packages/mnemonic-client/package.json` — version: 0.1.0, build: `tsup src/index.ts`, exports: `dist/index.*`
- `packages/mnemonic-client/tsconfig.json` — rootDir: "src", include: ["src"]
- `packages/mnemonic-client/vitest.config.ts` — minimal, just `globals: true`
- `packages/mnemonic-client/test/client.test.ts` — 182 lines, uses old `mnemonic()` Promise API

### Key Technical Facts for Implementation

#### HttpApiClient.make pattern:
```ts
HttpApiClient.make(Api, { baseUrl, transformClient })
// Returns Effect.Effect (NOT scoped) → use `effect:` in Effect.Service
// transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token))
```

#### Effect.Service pattern for client:
```ts
export class MnemonicClient extends Effect.Service<MnemonicClient>()('MnemonicClient', {
  effect: Effect.gen(function* () {
    const baseUrl = yield* Config.string('MNEMONIC_URL').pipe(Config.withDefault('http://localhost:8787'))
    const apiKey = yield* Config.option(Config.redacted('MNEMONIC_API_KEY'))
    const client = yield* HttpApiClient.make(Api, {
      baseUrl,
      transformClient: Option.match(apiKey, {
        onNone: () => identity,
        onSome: (key) => HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(key))),
      }),
    })
    return client
  }),
  dependencies: [FetchHttpClient.layer],
}) {}
```

#### Build System (tsup → dist):
- Entry: `../../src/client.ts` (cross-package, pointing at source)
- Output: `dist/client.js`, `dist/client.mjs`, `dist/client.d.ts`, `dist/client.d.mts`
- package.json exports should reference `dist/client.*` NOT `dist/index.*`
- tsconfig.json rootDir restriction must be relaxed (remove rootDir or change to `../..`)

#### Test Pattern (existing server spawn, reuse):
- Server spawn: `spawn('bun', ['run', 'src/index.ts'], { cwd: SERVER_ROOT, env: { PORT, API_KEY, DB_PATH, LD_LIBRARY_PATH } })`
- REQUIRED_LD_LIBRARY_PATH = `/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib`
- ConfigProvider.fromMap: `new Map([['MNEMONIC_URL', baseUrl], ['MNEMONIC_API_KEY', apiKey]])`
- Effect test pattern: `Effect.runPromise(program.pipe(Effect.provide(Layer)))`

## [2026-02-24] Task 1: src/client.ts created

### Result
- 30 lines, uses `effect:` (not `scoped:`), `dependencies: [FetchHttpClient.layer]`
- Re-exports: Api, Learning, Secret, WorkingStatePayload, WorkingStateResponse, InjectResult, InjectTraceResult, QueryResult, Stats, DatabaseError, EmbeddingError, NotFoundError, Unauthorized, ValidationError
- `tsc --noEmit` shows only pre-existing warnings in repo.ts/live.ts — zero errors in client.ts

### Pattern used
```ts
transformClient: Option.isSome(apiKey)
  ? HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(apiKey.value)))
  : undefined,
```

## Task 2: Build System Reconfiguration (2026-02-24)

### What worked
- `tsup ../../src/client.ts --format cjs,esm --dts --clean --outDir dist` — tsup uses entry FILENAME for output naming, so `client.ts` → `client.js/mjs/d.ts/d.mts`
- Removing `rootDir: "src"` from tsconfig.json is required for cross-package DTS generation
- Adding `"../../src/**/*"` to tsconfig `include` allows tsc to resolve types from project root src/
- Thin re-export `export * from '../../src/client'` in `src/index.ts` keeps tsc lint working
- Build succeeded with exit 0, producing all 4 expected dist files

### Key facts
- tsup output filename = entry file basename (not the package name)
- `rootDir` in tsconfig blocks cross-directory imports in DTS generation
- `src/index.ts` as re-export is a lint convenience; actual build entry is `../../src/client.ts`

## [2026-02-24] Task 3: README rewritten

### Result
- 152 lines, Effect-only API, no old Promise/mnemonic() references
- All 20 endpoints documented across 4 groups
- All 13 exported types listed
- Config section shows MNEMONIC_URL + MNEMONIC_API_KEY env vars with ConfigProvider.fromMap override pattern
- Evidence saved to `.sisyphus/evidence/task-3-readme-check.txt`

### Key decisions
- Used tables for endpoint listing (concise, scannable)
- Showed ConfigProvider.fromMap pattern for test/script overrides (from learnings.md research)
- "Promise" appears 2x in README but only as `Effect.runPromise` — not old API
- Kept method pattern section generic rather than listing every param for every endpoint

## [2026-02-24] Task 4: Smoke test rewritten

### Result
- `test/client.test.ts` rewritten to 126 lines using `MnemonicClient` Effect.Service API
- 3 tests pass: `health.healthCheck`, `learnings.learn`, `learnings.getStats`
- `bun test` exits 0 in 788ms

### Key fixes required
1. `src/index.ts` had wrong relative path: `../../src/client` resolves to `packages/src/client` (wrong). Fixed to `../../../src/client` → `/home/chase/mnemonic/src/client` (correct)
2. `data/` directory must exist at `/home/chase/mnemonic/data/` for SQLite to open — server fails silently in a retry loop without it. Created manually; test infrastructure should `mkdir -p` it in beforeAll if needed.

### Pattern confirmed working
```ts
const testLayer = MnemonicClient.Default.pipe(
  Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map([
    ['MNEMONIC_URL', BASE_URL],
    ['MNEMONIC_API_KEY', API_KEY],
  ]))))
)
const run = <A>(eff: Effect.Effect<A, unknown, MnemonicClient>) =>
  Effect.runPromise(eff.pipe(Effect.provide(testLayer)))
```

### Method call shapes confirmed
- `client.health.healthCheck()` — no args, returns `{ status: string }`
- `client.learnings.learn({ payload: { trigger, learning } })` — returns `{ id, trigger, ... }`
- `client.learnings.getStats()` — no args, returns `{ totalLearnings, ... }`

## [2026-02-24] Task: Code Quality Review

### Verification outcomes
- `packages/mnemonic-client` build passes (`BUILD_EXIT:0`) and emits expected dist files: `client.js`, `client.mjs`, `client.d.ts`, `client.d.mts`
- Bundle scan for `drizzle|libsql|huggingface|@effect/sql` in `packages/mnemonic-client/dist/` returns clean (`BUNDLE_GREP_EXIT:1`)
- `src/client.ts` matches Effect.Service shape: uses `effect:`, no `scoped:`, and has `dependencies: [FetchHttpClient.layer]`
- `packages/mnemonic-client/src/index.ts` stays single-line re-export: `export * from '../../../src/client'`

## [2026-02-24] Task: Scope Fidelity Check

### Verification outcomes
- `git show --name-only HEAD` confirms commit `8ca54ce` touches only `src/client.ts` and 5 files in `packages/mnemonic-client/`
- Server module files are unchanged in commit range (`HEAD~1..HEAD`): `src/domain.ts`, `src/errors.ts`, `src/api.ts`, `src/*/api.ts`, `src/*/live.ts`
- Expected server symbols remain present: domain schema classes, error tagged errors, and `Api` group wiring
- Manual client interfaces and Promise wrapper signatures are absent from `packages/mnemonic-client/` and `src/client.ts`
