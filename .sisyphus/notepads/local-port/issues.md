# Issues / Gotchas

## Critical
- Score inversion: Vectorize similarity (0-1 higher=better) vs libSQL distance (0-2 lower=better). conversion = 1 - distance. Sort ORDER BY distance ASC (was DESC). Threshold: (1-distance) >= threshold.
- F32_BLOB incompatibility with Drizzle: must use raw SQL for ALL vector insert/query ops.
- State tables (stateRuns, stateRevisions, stateEvents) are NOT in DO constructor DDL — must add to initDb().

## Medium
- DO constructor only inits learnings + secrets. initDb() must create ALL 5 tables.
- setSecret rowsAffected check may differ in libSQL — use INSERT OR REPLACE or INSERT ON CONFLICT DO UPDATE.
- convertDbLearning: embedding is now raw blob from F32_BLOB, not JSON string. Don't JSON.parse it.
- getLearnings uses `this.convertDbLearning` with `this` binding — need to bind properly in MnemonicService.
