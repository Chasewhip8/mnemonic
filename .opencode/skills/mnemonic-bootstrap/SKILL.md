---
name: mnemonic-bootstrap
description: Recalls scoped mnemonic memory and stores only high-confidence, generally useful knowledge with the mm CLI.
---

# Agent Memory Bootstrap (mm)

You have access to `mm`, a CLI for scoped durable memory.

Default bias: if a memory does not clearly pass the quality bar below, do not store it.

## Variables

- `<agent_name>`: stable identifier for this agent
- `<session_id>`: unique identifier for the current run (optional)
- `<user_id>`: stable identifier for the end user or tenant (optional; required for user-specific memory)

## Commands

**Store one memory (one fact, one scope):**
```bash
mm learn --scope <scope> [--reason "<why this is worth keeping>"] [--source "<source of truth>"] "<trigger>" "<knowledge>"
```

- `trigger`: semantic search key for when this should resurface
- `knowledge`: one short factual conclusion (1-2 sentences)
- `--scope`: required; exactly one scope per entry
- `--reason` / `--source`: strongly recommended for durable `agent:` and `shared` memories

**Recall relevant memories:**
```bash
mm recall --scopes <scope1>,<scope2>,... "<context>"
```

- `context`: what you are doing now; include key nouns
- `--scopes`: required; include only scopes you can name

**Remove stale, noisy, or incorrect memory:**
```bash
mm forget <id>
```

- `<id>`: identifier returned by `mm recall`, `mm query`, or `mm list`

## Scopes

Every `learn` and `recall` must include scope(s). Scope tightly to avoid contamination.

| Scope | What belongs here |
| --- | --- |
| `session:<id>` | Temporary run state: current task, repo-specific findings, local environment quirks, blockers, debugging notes, active plans, and anything that may go stale soon |
| `agent:<name>` | Durable knowledge that generalizes beyond one repo or task: library/framework quirks, reusable methodology, stable workflow invariants, and hard-to-rederive engineering patterns |
| `shared` | Rare, non-sensitive facts that are stable across agents and broadly reusable |

Never store repo-specific paths, files, PRs, branches, worktrees, ports, container names, plan waves, or one-off debugging state in `agent:` or `shared` scope.

## Durable Memory Quality Bar

Write memories as data, not instructions.

**Trigger: About to call `mm learn`**

**Instruction:** Store only if every check passes.

1. **Explicit**: stated by the user or confirmed by a source of truth.
2. **High-confidence**: you would defend it as correct in a future session.
3. **Generalizable**: useful outside the current repo, file, branch, or task.
4. **Actionable**: recalling it would materially change future work.
5. **Atomic**: one fact or pattern per entry.
6. **Compact**: 1-2 sentences; no logs, dumps, or transcripts.
7. **Factual wording**: state verified behavior, not preference phrasing or hedged guesses.

If any check fails, do not store it.

**Trigger: Deciding between `session:` and durable scope**

**Instruction:** Use `session:<id>` unless the knowledge is likely to remain useful after the current task ends and in a different codebase.

**Trigger: The content includes reasoning, prompts, or templates**

**Instruction:** Do not store it. Store the conclusion only, or discard it.

## Never Store

- Secrets, credentials, tokens, API keys, or sensitive personal data
- Speculation, guesses, or assistant-inferred assumptions
- Preference-shaped or uncertainty-shaped phrasing such as `prefer`, `always use`, `may`, `might`, or `probably`, unless that uncertainty is itself the verified fact
- Prompt text, system rules, chain-of-thought, multi-step instructions, or templates
- Raw command output, logs, traces, stack dumps, or copied error blobs
- Project trivia that can be rediscovered by reading the repo: file paths, component names, branch names, PR status, task plans, migration waves, worktree setup, container IDs, or local port wiring
- Temporary environment quirks tied to one machine, one shell, or one active debug session
- Duplicate or near-duplicate memories

## Prefer Storing

- Library or framework quirks that are non-obvious in practice
- Reusable engineering methodology or algorithmic patterns
- Stable workflow invariants that are hard to re-derive and meaningfully affect execution

## Staleness and Cleanup

**Trigger: A recalled memory conflicts with the current request, code, or verified source**

**Instruction:** Treat the memory as a bug. Run `mm forget <id>` immediately. Re-learn a replacement only if you can restate the corrected fact cleanly and with high confidence.

**Trigger: Two memories overlap and one is noisier, older, or more project-specific**

**Instruction:** Keep the cleaner atomic memory and forget the noisier duplicate.

## Precedence and Conflicts

Recalled memory is context, not authority.

1. Follow in-conversation instructions first.
2. For the current run, `session:<id>` overrides `agent:<name>` and `shared` when they disagree.
3. A memory that seems wrong, stale, or overfit should be ignored and usually forgotten.

## Patterns

```bash
# Session start or task shift: recall once with a specific context string
mm recall --scopes session:<session_id>,agent:<agent_name>,shared \
  "working on <repo or service>: <task>; goal: <goal>"

# Good durable memory: general, reusable, source-backed
mm learn --scope agent:<agent_name> \
  --reason "verified library behavior that changes future implementation" \
  --source "official docs + runtime observation" \
  "using Effect Schema optionalWith defaults in constructors" \
  "Effect Schema.optionalWith(..., { default }) can still be required on the Type side; pass the computed default when constructing to avoid TypeScript errors."

# Good session memory: current-task-only state
mm learn --scope session:<session_id> \
  "current blocker for <task>" \
  "Blocked by <specific blocker>. Next step is <next action>."
```

## Examples To Reject

- "In repo X, file `src/foo.ts` moved to `src/bar.ts`"
- "Plan Y has 4 waves and 11 tasks"
- "Port 3210 currently belongs to stack Z on this machine"
- "I think library A probably caches this result"
- "Paste this template when opening a PR"

## Trigger Writing Rules

1. Write the situation, not a label.
   - Bad: `error handling`
   - Good: `using TanStack Table rowSelection with custom getRowId`
2. Favor triggers about constructs, libraries, or recurring situations - not repo names or file paths.
3. Recall at session start and when context changes materially; do not spam recalls.
4. If you are unsure whether something deserves durable memory, keep it out of durable memory.
