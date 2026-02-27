# mnemonic

_What survives a run._

mnemonic is a self-hosted memory layer for agents.
It exposes durable memory via REST with scoped recall.

## Local references

- **Runtime API**: `src/index.ts`
- **Service logic**: `src/service.ts`
- **Schema source of truth**: `src/database/schema/`
- **DB migrations**: `src/database/migrations/`

---

## Core API surface

- Memory: `/learn`, `/inject`, `/inject/trace`, `/query`, `/learnings`, `/learning/:id`, `/learning/:id/neighbors`, `/stats`, `DELETE /learning/:id`, `DELETE /learnings`, `PATCH /learning/:id/scope`

Learnings include `last_recalled_at`, `recall_count` for tracking. Bulk delete: `DELETE /learnings?not_recalled_in_days=90` or `?scope=shared` (requires at least one filter).

---

## Agent Memory

mnemonic gives agents durable memory across sessions via the `mm` CLI. Memories are semantically indexed — recall finds relevant memories by meaning, not keyword match.

### The Core Loop

```bash
# 1. RECALL — at session start, prime your context
mm recall "building the auth middleware" --scopes shared,agent:prometheus,session:ses_abc123
# Injects relevant memories into your context.

# 2. WORK — do your thing

# 3. LEARN — store what's worth remembering
mm learn "drizzle migration gotcha" \
  "Drizzle generate fails silently if schema import is wrong. Always check the generated SQL file is non-empty." \
  --scope shared
```

`recall` injects memories into your context (fire-and-forget) and bumps recall stats. `query` returns results for you to inspect without side effects. Prefer `recall` for priming context, `query` for browsing/searching.

### Scopes

Scopes partition memory by audience and lifetime.

| Scope | Store here | Lifetime | Analogy |
|---|---|---|---|
| `shared` | Facts non-trivial to discover. Any agent benefits. | Permanent if recalled. Pruned if **never recalled** after 14d. | Semantic memory — knowledge |
| `agent:<name>` | Role-specific decisions, user preferences, hard-won patterns | 30 days from creation (unconditional) | Procedural memory — how-to |
| `session:<id>` | Narrative context: why we're here, what we tried, what's blocked | 7 days from creation (unconditional) | Episodic memory — story |

**Session IDs**: Your agent framework provides the session ID (e.g., `ses_abc123` from opencode). Use it as `session:<your_session_id>`.

### When to Learn

**`--scope shared`** — Global knowledge that was non-trivial to discover. Any agent benefits. Recalling it extends its life.

```bash
mm learn "Effect retry pattern" \
  "Use Schedule.exponential with Effect.retry. Do NOT use Effect.repeat — that's for success repetition." \
  --scope shared

mm learn "bun test no watch flag" \
  "bun test --watch does not exist. Use bun test --rerun-each." \
  --scope shared
```

**`--scope agent:<name>`** — Decisions and preferences specific to this agent's role. For a planner like `agent:prometheus`: user taste, architectural choices, conclusions reached after deliberation. Dies after 30 days regardless of recall frequency — re-learn if still relevant.

```bash
mm learn "user error handling preference" \
  "Chase: handle errors at boundaries only, not at every call site. No defensive coding." \
  --scope agent:prometheus

mm learn "plan format requirement" \
  "User requires TL;DR at top of every plan. Old format without it was rejected." \
  --scope agent:prometheus
```

**`--scope session:<opencode_session_id>`** — "Why are we here?" and "How did we get here?" Captures the episode — decisions made, dead ends hit, context that a future session would need to continue the work. Ephemeral by design (7 days).

```bash
mm learn "why rewriting the client" \
  "Original client used raw fetch. Migrating to Effect for typed errors. Decided after evaluating fetch, axios, and Effect — Effect won because server already uses it." \
  --scope session:ses_abc123

mm learn "auth work blocked" \
  "Auth refactor needs a schema migration we haven't written yet. Parked it, pivoting to CLI work. Resume after migration lands." \
  --scope session:ses_abc123
```

### Writing Good Triggers

The trigger is the semantic search key. Write it as the *context where this knowledge would be useful*, not a label.

```bash
# Bad — matches everything vaguely
mm learn "error" "use Effect.fail" --scope shared

# Good — matches when someone is actually dealing with this situation
mm learn "handling API timeout in Effect service" \
  "Pipe Effect.timeout(duration) then Effect.catchTag('TimeoutException', ...) — don't use Promise.race" \
  --scope shared
```

### Quick Reference

```bash
# Recall (injects into context, bumps recall stats)
mm recall "context" --scopes shared                # specific scopes
mm recall "context" --scopes shared,agent:x        # specific scopes
mm recall "context" --trace                        # debug: candidates, scores, timing

# Query (returns results, no side effects)
mm query "search text" --scopes shared             # specific scopes
mm query "search text" --scopes shared,agent:x     # specific scopes

# Store
mm learn "trigger" "knowledge" --scope shared
mm learn "trigger" "knowledge" --scope shared --reason "discovered during debugging"

# Manage
mm forget <id>                               # delete one memory
mm list --scope agent:prometheus             # browse a scope
mm stats                                     # counts by scope
mm neighbors <id>                            # find semantically similar memories
mm rescope <id> <scope>                      # move a memory to a different scope

# Flags: --scope (required, singular) for writes, --scopes (required, plural, csv) for reads
```

---

## Bootstrap Prompt

Need a minimal prompt to drop into an agent's system instructions? See **[BOOTSTRAP.md](./BOOTSTRAP.md)** — a distilled version covering just `learn` and `recall` with mandatory scoping.
