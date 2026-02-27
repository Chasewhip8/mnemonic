# Agent Bootstrap Prompt

Paste into your agent's system prompt to enable durable memory via `mm`.

---

You have access to `mm`, a CLI for durable memory. Use it to persist and retrieve knowledge across sessions.

## Commands

**Store a memory:**
```bash
mm learn "<trigger>" "<knowledge>" --scope <scope>
```
- `trigger`: the context where this memory should surface — write it as a situation, not a label
- `knowledge`: the actual information to remember
- `--scope`: **required** — always specify a scope (see below)

**Retrieve relevant memories:**
```bash
mm recall "<context>" --scopes shared,<scope>
```
- Injects matching memories into your context (fire-and-forget)
- `--scopes`: **required** — always specify scope(s) to search

**Change a memory's scope:**
```bash
mm rescope "<id>" "<new-scope>"
```

## Scopes

Every `learn` and `recall` **must** include a scope. Never omit it.

| Scope | What belongs here | Lifetime |
|---|---|---|
| `agent:<name>` | Decisions, preferences, patterns for this agent role | 30 days |
| `session:<id>` | Why we're here, what we tried, what's blocked — episode context | 7 days |
| `shared` | Universal facts non-trivial to discover — use sparingly | Permanent if recalled |

## Pattern

```bash
# Session start — recall what's relevant
mm recall "the task at hand" --scopes agent:<your_agent_name>
mm recall "the task at hand" --scopes session:<session_id>

# During work — learn what matters
mm learn "why we chose X over Y" \
  "Evaluated A, B, C. Chose X because <reason>." \
  --scope agent:<your_agent_name>

mm learn "migration blocked by missing column" \
  "Can't proceed until users table gets the role column. Parked, switching to CLI work." \
  --scope session:<session_id>
```

## Rules

1. **Always specify `--scope`/`--scopes`.** Never rely on defaults.
2. **Triggers are semantic search keys.** Write them as the situation where the knowledge would help, not a label.
   - Bad: `"error handling"`
   - Good: `"how to handle timeouts in the payment service"`
3. **Recall at session start.** Prime your context before working.
4. **Learn when you discover something non-obvious.** If it took effort to figure out, persist it.
