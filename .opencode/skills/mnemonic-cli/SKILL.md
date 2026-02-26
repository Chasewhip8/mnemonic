---
name: mnemonic-cli
description: Use when working with mnemonic memory operations, mm commands, agent memory, recall, learning, secrets, or any mnemonic/memory CLI tasks.
---

# Mnemonic CLI Reference

## Config

| Source | Key | Default |
|--------|-----|---------|
| Env var | `MNEMONIC_URL` | `http://localhost:8787` |
| Env var | `MNEMONIC_API_KEY` | (none) |

## Global Flags

```
--url <str>      Override server URL
--api-key <str>  Override API key
--json           Output raw JSON instead of XML
```

## Command Reference

### Memory Commands

**`mm learn <trigger> <learning>`**
Store a new memory.
- `--confidence <float>` confidence score (0–1)
- `--scope <str>` scope name
- `--reason <str>` reason for storing
- `--source <str>` source attribution

**`mm recall <context>`**
Inject relevant memories for a context (fire-and-forget injection). Use when you want to prime a session with relevant memories.
- `--scopes <csv>` comma-separated scope names
- `--limit <int>` max memories to inject
- `--threshold <float>` similarity threshold
- `--trace` return debug info (candidates, scores, timing) instead of injecting

**`mm query <text>`**
Semantic search returning similarity-ranked results. Use when you want to search/browse memories explicitly. Different from `recall` (which injects; `query` returns results).
- `--scopes <csv>` comma-separated scope names
- `--limit <int>` max results

**`mm list`**
List stored memories.
- `--scope <str>` filter by scope
- `--limit <int>` max results

**`mm forget <id>`**
Delete a memory by ID. No extra options.

**`mm prune`**
Bulk delete memories. **Requires `--confirm` AND at least one filter.**
- `--confirm` (required) safety flag — command fails without it
- `--confidence-lt <float>` delete memories with confidence below this value
- `--not-recalled-in-days <int>` delete memories not recalled in N days
- `--scope <str>` delete memories in this scope

**`mm neighbors <id>`**
Find semantically similar memories to a given ID.
- `--threshold <float>` similarity threshold
- `--limit <int>` max results

**`mm stats`**
Show memory counts by scope. No extra options.

### Secret Commands

**`mm secret set <name> <value>`**
Store a secret.
- `--scope <str>` scope name

**`mm secret get <name>`**
Retrieve a secret. Returns **raw value only** (no XML wrapping — exception to default output format).
- `--scopes <csv>` comma-separated scope names

**`mm secret rm <name>`**
Delete a secret.
- `--scope <str>` scope name

**`mm secret list`**
List secrets.
- `--scope <str>` filter by scope

### System Commands

**`mm health`**
Check server health. Does **not** require authentication.

**`mm cleanup`**
Remove stale/orphaned data. Requires authentication.

## Scope Flag Reference

| Flag | Commands |
|------|----------|
| `--scope` (singular) | `learn`, `list`, `prune`, `secret set`, `secret rm`, `secret list` |
| `--scopes` (plural, csv) | `recall`, `query`, `secret get` |

## Output Format

Default output is XML-like (optimized for LLM parsing). Use `--json` for raw JSON.

Exception: `mm secret get` always returns the raw secret value — no XML or JSON wrapping.

Example XML output (learn/recall):
```xml
<learning id="abc123" confidence="0.9" scope="default" recall_count="0" created="2024-01-01T00:00:00Z">
  <trigger>API timeout</trigger>
  <content>The API has an undocumented 3s minimum timeout</content>
</learning>
```

## Errors

All errors go to stderr, exit non-zero.

| Error | Message |
|-------|---------|
| Auth failed | `Error: Authentication failed. Check --api-key or MNEMONIC_API_KEY.` |
| Not found | `Error: <message>` |
| Validation | `Error: <message>` |
| DB error | `Error: Database error` |
| Embedding failed | `Error: Embedding generation failed` |
| Connection refused | `Error: Could not connect to <url>` |
