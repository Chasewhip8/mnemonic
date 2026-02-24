# Issues — mnemonic-client-rewrite

## [2026-02-24] Atlas: Known Issues / Gotchas

- `src/security.ts` imports `./config` (AppConfig) — this is a "dead code" transitive dep but acceptable (~20 lines)
- `packages/mnemonic-client/tsconfig.json` rootDir: "src" will break if not updated — must be removed
- tsup output filename is based on entry filename: `../../src/client.ts` → `client.js` not `index.js`
- package.json main/module/types and exports.".".* must reference `dist/client.*` not `dist/index.*`
- LD_LIBRARY_PATH in test must include `/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib` for SQLite
- SERVER_ROOT in test must remain `/home/chase/mnemonic`
- Test timeout: STARTUP_TIMEOUT_MS=120_000, TEST_TIMEOUT_MS=240_000

## [2026-02-24] Task: Code Quality Review

- Root `bunx tsc --noEmit` currently exits 1 due existing Effect lint diagnostics in `src/learnings/repo.ts` and `src/state/{live,repo}.ts` (not client package build failures)
- `src/client.ts` has one info-level LSP diagnostic (`organizeImports`) but no functional/type errors

## [2026-02-24] Task: Scope Fidelity Check

- `git diff HEAD~1 -- src/` is contaminated by unstaged workspace edits (currently includes `src/state/live.ts` and `src/state/repo.ts`); use `git diff HEAD~1..HEAD -- src/` to audit commit scope only
