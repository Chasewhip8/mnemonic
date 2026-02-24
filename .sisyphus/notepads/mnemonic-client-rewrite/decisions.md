# Decisions — mnemonic-client-rewrite

## [2026-02-24] Atlas: Architecture Decisions

- Use `effect:` NOT `scoped:` — HttpApiClient.make returns plain Effect, not scoped
- tsup entry: `../../src/client.ts` — bypass rootDir constraint, direct file reference
- Delete/replace `packages/mnemonic-client/src/index.ts` — either delete or make `export * from '../../src/client'`
- Version bump: 0.1.0 → 0.2.0 (breaking change)
- No Promise wrapper, no positional methods — Effect-only
- Accept config.ts dead code in bundle (~20 lines from security.ts import chain) — not worth refactoring
- LearningWithSimilarity not re-exported separately — accept inline type
- tsconfig.json in package: remove rootDir: "src", add ../../src to include OR rely entirely on tsup for DTS
