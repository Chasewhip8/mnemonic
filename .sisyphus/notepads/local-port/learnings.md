# Learnings

## Codebase Summary
- `src/do/DejaDO.ts` — Full DurableObject class (1362 lines). All business logic lives here.
- `src/index.ts` — CF Worker entrypoint: auth, routing, MCP handler. Proxies to DO via stub.fetch.
- `src/cleanup.ts` — Calls DO via stub.fetch for cleanup.
- `src/schema.ts` — Drizzle schema for 5 tables. embedding column is `text('embedding')`.
- No state tables in DO constructor DDL — only learnings and secrets. State tables must be added.

## Key Architecture Notes
- DejaDO constructor only creates learnings + secrets tables + ALTER TABLE migrations.
- State tables (stateRuns, stateRevisions, stateEvents) are in schema.ts but NOT in DO constructor DDL.
- db.ts initDb() must add DDL for ALL 5 tables.
- score semantics: Vectorize returns similarity (0-1, higher=better); libSQL vector_distance_cos returns distance (0-2, lower=better). Conversion: similarity = 1 - distance.
- All vector inserts/queries must use raw db.execute() with vector32() SQL function.
- Drizzle can't wrap with vector32() — must use raw SQL for vector ops.
- setSecret currently uses update-then-check-rowsAffected — must change to INSERT ON CONFLICT DO UPDATE.

## Task 1 Validation Learnings
- `@huggingface/transformers` on this Nix/Bun setup needs `libstdc++.so.6` at runtime; auto re-exec with `LD_LIBRARY_PATH=/run/current-system/sw/share/nix-ld/lib` lets `bun run scripts/validate-blockers.ts` succeed without manual shell setup.
- `pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX')` returns `Float32Array` data with length 384 for `hello world`.
- libSQL vector flow works with `F32_BLOB(384)`, `vector32(?)`, and `vector_distance_cos(...)`; identical vectors returned distance `0`, embedding roundtrip returned near-zero distance (`-1.7763568394002505e-15`).
- Cleanup should remove `test-validate.db`, `test-validate.db-shm`, and `test-validate.db-wal` in both success and failure paths.

## [2026-02-23] Task 1: Hard Blocker Validation - PASS
- Transformers.js: `tensor.data` is the Float32Array (not `.tolist()`). Length 384.
- libSQL vector_distance_cos of identical vectors returns exactly 0 (or -1.78e-15 floating point)
- vector32() takes a JSON array string: `JSON.stringify(Array.from(embedding))`
- On NixOS, needs LD_LIBRARY_PATH=/run/current-system/sw/share/nix-ld/lib for libstdc++
- Packages installed: @huggingface/transformers, @libsql/client (both now in package.json)
- bge-small-en-v1.5-ONNX model produces Float32Array of length 384 with `{ pooling: 'cls', normalize: true }`


## Task 2: src/db.ts
- `@libsql/client` `createClient` accepts `url: 'file:./path'` for local SQLite
- `db.batch()` takes array of `{ sql, args }` objects — good for DDL batching
- `drizzle-orm/libsql` driver: `drizzle(client, { schema })` works with libsql Client
- libSQL supports `F32_BLOB(384)` column type natively — verified via PRAGMA table_info
- ALTER TABLE ADD COLUMN on existing columns throws, so wrap in try/catch for idempotency
- Biome wants `node:` protocol for Node.js builtins (e.g., `import { mkdirSync } from 'node:fs'`)
- Singleton pattern: module-level `let` + null check is clean for getDb()/getDrizzle()

## [2026-02-23] Task 3: src/embeddings.ts
- Module-level `let extractor` singleton pattern — `initEmbeddings()` loads once, `createEmbedding()` uses it
- `pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX')` returns `FeatureExtractionPipeline`
- Pipeline call options: `{ pooling: 'cls', normalize: true }` → output.data is Float32Array length 384
- `Array.from(output.data as Float32Array)` converts to number[]
- On NixOS, sharp (transitive dep of transformers.js) needs `LD_LIBRARY_PATH` pointing to libstdc++.so.6
- Exact path: `/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib`
- The `dtype not specified` warning on model load is benign — defaults to fp32 on cpu


## [2026-02-23] Task 4: src/schema.ts — F32_BLOB custom type
- `customType` from `drizzle-orm/sqlite-core` lets you define arbitrary DDL column types
- Pattern: `customType<{ data: T; driverData: D }>({ dataType() { return 'F32_BLOB(384)'; } })`
- `driverData: null` is correct for blob columns where Drizzle won't read raw values (we use raw SQL for vector ops)
- Replace `text('embedding')` with `f32Blob('embedding')` — column name unchanged, DDL type changes to `F32_BLOB(384)`
- `grep -c 'sqliteTable' src/schema.ts` returns 6 (1 import line + 5 table definitions) — not 5

## [2026-02-23] Task 6: vector methods in src/service.ts
- All vector reads/writes in DejaService now use raw `this.db.execute()` with `vector32(?)`; no VECTORIZE in service.
- Similarity conversion is explicit everywhere: `similarity = 1 - distance` where distance is from `vector_distance_cos(...)`.
- Sorting is corrected for libSQL distance semantics: `ORDER BY distance ASC` in inject/query/trace/neighbors.
- Threshold checks now use similarity form (`similarity >= threshold`) in injectTrace and neighbors.
- learn() inserts embedding as `vector32(?)` with JSON embedding payload; inject() still updates recall tracking through Drizzle.

## Task 7: cleanup.ts rewrite
- Replaced CF cron trigger + DurableObject stub.fetch pattern with node-cron
- node-cron@4.2.1 installed (note: v4 uses default import, not named)
- `import type` needed for DejaService (type-only import)
- `startCleanupCron(service: DejaService): void` schedules `'0 0 * * *'` daily
- Zero CF imports confirmed


## Task 10 - Cloudflare Cleanup (2026-02-23)
- `@libsql/client`, `@huggingface/transformers`, `node-cron` were already in `dependencies` (not devDependencies) — no move needed
- Removed `wrangler` and `@cloudflare/workers-types` from devDependencies
- Updated scripts: `dev` → `bun run src/index.ts`, added `start`, removed `deploy`, `db:init`, `db:migrate:state`, `test:do`
- Removed `@cloudflare/workers-types` from tsconfig.json `types` array (kept `node`, `jest`)
- Deleted `wrangler.json`, `__mocks__/`, `src/do/` — all confirmed GONE
- `bun install` removed 2 packages cleanly
- `grep -c 'wrangler|@cloudflare' package.json` → 0


## Task 11 - Integration Tests (2026-02-23)
- Jest VM sandbox creates separate typed array constructors; onnxruntime-node returns Float32Array from main V8 context causing `instanceof` failures. Fix: custom test environment that injects real constructors into sandbox (`test/environment.js`).
- `vector_to_json()` is NOT available in local libsql `@libsql/client` v0.17.0. Fixed `getLearningNeighbors` to use cross-join instead: `FROM learnings l2, learnings l1 WHERE l1.id = ? AND l2.id != ?`
- secrets table has `name TEXT PRIMARY KEY` — same name in different scopes overwrites (not scoped). Tests must use different names per scope.
- `packages/deja-client/test/client.test.ts` uses `bun:test` (incompatible with jest). Excluded `/packages/` in testPathIgnorePatterns.
- Embedding model load takes ~1-2s; jest timeout set to 120000ms for safety.
- DB singleton pattern in db.ts: set `process.env.DB_PATH` before first `getDb()` call. Cleanup between tests via `DELETE FROM` rather than DB recreation (avoids singleton reset).
- Test DB files at `/tmp/deja-test-${process.pid}.db` — also clean up `-wal` and `-shm` suffixes in afterAll.

## cleanup() method in DejaService (2026-02-23)
- Added `cleanup()` to end of `DejaService` class in `src/service.ts` (before closing `}`)
- Uses existing imports: `like`, `sql`, `and` from `drizzle-orm` — no new imports needed
- Deletes: session:* entries >7 days, agent:* entries >30 days, confidence <0.3 entries
- `bun run typecheck` passes after insertion
