# Remove MCP Server & Tests

## TL;DR

> **Quick Summary**: Remove the hand-rolled MCP (JSON-RPC 2.0) server and all related tests from deja. MCP is cleanly isolated — one-way dependency on core repos, no SDK packages, no shared utilities at risk.
> 
> **Deliverables**:
> - `src/mcp/` directory deleted (4 files)
> - `test/mcp-tools.test.ts` deleted
> - 4 mixed files surgically edited to remove MCP imports/references
> - README updated to remove MCP documentation
> - All remaining tests pass, typecheck clean, zero MCP remnants in source
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (2 tasks, too small to parallelize)
> **Critical Path**: Task 1 (removals) → Task 2 (verification)

---

## Context

### Original Request
Remove the MCP server and MCP-related tests from the project.

### Interview Summary
**Key Discussions**:
- Full hard removal, not deprecation
- MCP is hand-rolled JSON-RPC 2.0 over HTTP — no `@modelcontextprotocol` SDK dependency
- Clean one-way isolation: MCP depends on LearningsRepo/StateRepo, never the reverse

**Research Findings**:
- 5 pure MCP files to delete, 4 mixed files to edit
- `parseMcpToolResult` and `parseMcpError` in test/helpers.ts are MCP-only (no non-MCP test uses them)
- No package.json, tsconfig, or vitest config changes needed
- README line 6 tagline says "REST + MCP" — needs updating

### Metis Review
**Identified Gaps** (addressed):
- README tagline on line 6 was not initially flagged → added to scope
- Blank line hygiene after removing describe("mcp") block → noted in task
- test/helpers.ts ends at line 198 (EOF) — removal should leave clean EOF at ~line 170
- CI/CD pipeline check for MCP-specific test filters → executor should verify during QA

---

## Work Objectives

### Core Objective
Remove all MCP server code, MCP tests, and MCP documentation references so deja is purely a REST memory layer.

### Concrete Deliverables
- `src/mcp/` directory removed
- `test/mcp-tools.test.ts` removed
- `src/api.ts` no longer references McpApi
- `src/http.ts` no longer references McpApiLive
- `test/helpers.ts` no longer exports parseMcpToolResult or parseMcpError
- `test/deja.test.ts` no longer has describe("mcp") block
- `README.md` updated: no MCP mentions in tagline or API docs

### Definition of Done
- [ ] `bun run check` exits 0
- [ ] `bun test` — all remaining tests pass
- [ ] `grep -ri "mcp" src/` returns empty
- [ ] `grep -r "parseMcp" test/` returns empty
- [ ] `ls src/mcp/ 2>&1` fails (directory gone)
- [ ] `ls test/mcp-tools.test.ts 2>&1` fails (file gone)

### Must Have
- All 5 MCP files deleted
- All 4 mixed files edited cleanly
- README updated
- Zero compile errors
- Zero test failures

### Must NOT Have (Guardrails)
- DO NOT touch `asRecord` or `asArray` in test/helpers.ts (used by non-MCP tests)
- DO NOT modify any file in `src/learnings/`, `src/state/`, `src/secrets/`, `src/health/`
- DO NOT restructure or reformat code beyond targeted line removals
- DO NOT reorder the Api class chain or HttpLive layer composition
- DO NOT "clean up" adjacent code while editing
- DO NOT modify package.json, tsconfig.json, or vitest.config.ts

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest via `bun test`)
- **Automated tests**: None new — existing suite validates no regressions
- **Framework**: vitest (via bun)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Verification**: Use Bash — run typecheck, tests, grep for remnants

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All Removals — single task):
└── Task 1: Delete MCP files + surgical edits + README update [quick]

Wave 2 (Verification — single task):
└── Task 2: Typecheck + tests + remnant grep (depends: 1) [quick]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Final
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2 |
| 2 | 1 | Final |
| F1-F4 | 2 | — |

### Agent Dispatch Summary

- **Wave 1**: 1 task → `quick`
- **Wave 2**: 1 task → `quick`
- **Final**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [x] 1. Remove all MCP code, tests, and documentation

  **What to do**:
  1. Delete `src/mcp/` directory entirely (contains: api.ts, handler.ts, live.ts, tools.ts)
  2. Delete `test/mcp-tools.test.ts`
  3. Edit `src/api.ts`:
     - Remove line 6: `import { McpApi } from './mcp/api'`
     - Remove `.add(McpApi)` from line 13 in the Api class chain
  4. Edit `src/http.ts`:
     - Remove line 10: `import { McpApiLive } from './mcp/live'`
     - Remove `Layer.provide(McpApiLive),` from line 17 in the ApiLive composition
  5. Edit `test/helpers.ts`:
     - Remove `parseMcpToolResult` function (lines 172-182)
     - Remove `parseMcpError` function (lines 184-198)
     - These are at end-of-file; file should end cleanly around line 170
  6. Edit `test/deja.test.ts`:
     - Remove `parseMcpToolResult,` from the destructured import on line 8
     - Remove the entire `describe("mcp", ...)` block (lines 544-670)
     - Clean up blank lines between the preceding describe block and the following describe("health + auth") block — should be one blank line, not a void
  7. Edit `README.md`:
     - Line 6: change `"REST + MCP"` to `"REST"` or `"a REST API"`
     - Delete the entire "Minimal MCP config" section (lines ~29-53, including surrounding `---` separators)

  **Must NOT do**:
  - Touch `asRecord`, `asArray`, or any other helper function in test/helpers.ts
  - Modify files in `src/learnings/`, `src/state/`, `src/secrets/`, `src/health/`
  - Reformat or restructure any code beyond the targeted removals
  - Reorder the Api class chain or HttpLive layer composition
  - Modify package.json, tsconfig.json, or vitest.config.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: All changes are small, surgical line removals across a known set of files. No complex logic or design decisions.
  - **Skills**: []
    - No specialized skills needed — all file deletions and line edits
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — no git operations in this task, commit is separate

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (files to edit):
  - `src/mcp/api.ts` — Pure MCP HttpApiGroup, delete entirely
  - `src/mcp/handler.ts` — Pure MCP JSON-RPC dispatcher, delete entirely
  - `src/mcp/live.ts` — Pure MCP Effect handler wiring, delete entirely
  - `src/mcp/tools.ts` — Pure MCP tool schema definitions, delete entirely
  - `test/mcp-tools.test.ts` — 481-line MCP integration test suite, delete entirely

  **Edit References** (exact lines to modify):
  - `src/api.ts:6` — `import { McpApi } from './mcp/api'` — remove this line
  - `src/api.ts:13` — `.add(McpApi)` — remove this from the class chain
  - `src/http.ts:10` — `import { McpApiLive } from './mcp/live'` — remove this line
  - `src/http.ts:17` — `Layer.provide(McpApiLive),` — remove this from the layer composition
  - `test/helpers.ts:172-198` — `parseMcpToolResult` and `parseMcpError` functions — remove both (end of file)
  - `test/deja.test.ts:8` — `parseMcpToolResult,` in import — remove just this token
  - `test/deja.test.ts:544-670` — `describe("mcp", ...)` block — remove entirely

  **WHY Each Reference Matters**:
  - The src/mcp/ files are the MCP implementation — deleting them is the core objective
  - The edit references are the 4 non-MCP files that import from MCP — these break on compile if not cleaned up
  - Line numbers are exact as verified by Metis against the current codebase

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: MCP source directory fully removed
    Tool: Bash
    Preconditions: Task edits complete
    Steps:
      1. Run: ls src/mcp/ 2>&1
      2. Assert: output contains "No such file or directory"
      3. Run: ls test/mcp-tools.test.ts 2>&1
      4. Assert: output contains "No such file or directory"
    Expected Result: Both paths return file-not-found errors
    Failure Indicators: Either path still exists
    Evidence: .sisyphus/evidence/task-1-files-deleted.txt

  Scenario: No MCP references remain in source
    Tool: Bash
    Preconditions: All edits complete
    Steps:
      1. Run: grep -ri "mcp" src/ || echo "CLEAN"
      2. Assert: output is exactly "CLEAN"
      3. Run: grep -r "parseMcp" test/ || echo "CLEAN"
      4. Assert: output is exactly "CLEAN"
    Expected Result: Zero MCP string matches in src/ and test/
    Failure Indicators: Any grep match returned
    Evidence: .sisyphus/evidence/task-1-no-remnants.txt

  Scenario: Edited files have valid syntax
    Tool: Bash
    Preconditions: All edits complete
    Steps:
      1. Run: bun run check
      2. Assert: exit code 0, no errors referencing mcp/McpApi/McpApiLive/parseMcpToolResult
    Expected Result: Clean typecheck with zero errors
    Failure Indicators: Any TypeScript error mentioning removed symbols
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES
  - Message: `refactor: remove MCP server and related tests`
  - Files: `src/mcp/` (deleted), `test/mcp-tools.test.ts` (deleted), `src/api.ts`, `src/http.ts`, `test/helpers.ts`, `test/deja.test.ts`, `README.md`
  - Pre-commit: `bun run check && bun test`

---

- [x] 2. Full verification pass

  **What to do**:
  1. Run `bun run check` — must exit 0 with no errors
  2. Run `bun test` — all remaining test files must pass
  3. Run `grep -ri "mcp" src/` — must return empty (zero matches)
  4. Run `grep -r "parseMcp" test/` — must return empty
  5. Confirm `src/mcp/` directory does not exist
  6. Confirm `test/mcp-tools.test.ts` does not exist
  7. Check for any CI/CD config (`.github/workflows/`) that references MCP tests by name — if found, note for removal
  8. If ANY check fails, fix the issue and re-run all checks

  **Must NOT do**:
  - Make any changes beyond fixing verification failures
  - Skip any verification step

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure verification — running commands and checking output
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI to test — this is backend/test verification only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, after Task 1)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 1

  **References**:

  **Verification Commands**:
  - `bun run check` — TypeScript typecheck command for this project
  - `bun test` — Runs vitest test suite

  **WHY Each Reference Matters**:
  - Typecheck catches dangling imports from deleted MCP modules
  - Test suite confirms no non-MCP test depended on MCP code
  - Grep scans catch any string references missed by targeted edits

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Full build and test verification
    Tool: Bash
    Preconditions: Task 1 complete, all MCP code removed
    Steps:
      1. Run: bun run check
      2. Assert: exit code 0
      3. Run: bun test
      4. Assert: all test suites pass, zero failures
    Expected Result: Clean typecheck and all tests passing
    Failure Indicators: Any non-zero exit code or test failure
    Evidence: .sisyphus/evidence/task-2-build-test.txt

  Scenario: Zero MCP remnants in codebase
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: grep -ri "mcp" src/ | head -20 || echo "CLEAN"
      2. Assert: output is "CLEAN"
      3. Run: grep -r "parseMcp" test/ || echo "CLEAN"
      4. Assert: output is "CLEAN"
      5. Run: ls src/mcp/ 2>&1
      6. Assert: "No such file or directory"
      7. Run: ls test/mcp-tools.test.ts 2>&1
      8. Assert: "No such file or directory"
    Expected Result: Complete absence of MCP in source and test directories
    Failure Indicators: Any match found or file/directory still exists
    Evidence: .sisyphus/evidence/task-2-remnant-scan.txt

  Scenario: CI/CD has no MCP-specific references
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: grep -ri "mcp" .github/ 2>/dev/null || echo "CLEAN or NO CI DIR"
      2. Assert: output is "CLEAN or NO CI DIR" or no MCP-specific test filters
    Expected Result: No CI config targeting MCP tests specifically
    Failure Indicators: CI config with MCP test filter that would now match nothing
    Evidence: .sisyphus/evidence/task-2-ci-check.txt
  ```

  **Commit**: NO (Task 1 already committed)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run check` + `bun test`. Review all changed files for: dangling imports, empty blocks left after removal, broken formatting, dead code. Check that no MCP string literals remain anywhere in src/ or test/.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Verify the server starts without errors. Verify REST endpoints still work (hit /health, /learn, /query). Verify /mcp endpoint returns 404 or equivalent. Save evidence.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was removed, nothing beyond spec was touched. Check that test/helpers.ts still exports asRecord, asArray, and all other non-MCP helpers. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `refactor: remove MCP server and related tests` — src/mcp/ (deleted), test/mcp-tools.test.ts (deleted), src/api.ts, src/http.ts, test/helpers.ts, test/deja.test.ts, README.md
  - Pre-commit: `bun run check && bun test`

---

## Success Criteria

### Verification Commands
```bash
bun run check           # Expected: exit 0, no errors
bun test                # Expected: all suites pass
grep -ri "mcp" src/     # Expected: no output (zero matches)
grep -r "parseMcp" test/ # Expected: no output (zero matches)
ls src/mcp/             # Expected: No such file or directory
```

### Final Checklist
- [ ] All 5 MCP files deleted
- [ ] All 4 mixed files edited (api.ts, http.ts, helpers.ts, deja.test.ts)
- [ ] README.md updated (tagline + MCP config section removed)
- [ ] Zero compile errors
- [ ] Zero test failures
- [ ] Zero "mcp" string matches in src/
- [ ] Zero "parseMcp" matches in test/
- [ ] No files outside the listed set were modified
