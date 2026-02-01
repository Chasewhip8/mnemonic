# deja

*What survives a run.*

deja provides durable recall for agent systems.

It extracts structured memory from completed runs and stores it independently of any single execution. Memory in deja is explicit, reviewable, and optional.

Agents may consult deja. They are never required to.

## What deja is

- **Post-run recall** — derived from artifacts and outcomes
- **Addressable and scoped** — by user, agent, or session
- **Designed to persist** — longer than any single agent session

## What deja is not

- Conversation history
- Implicit context
- Hidden state
- Live cognition

## Why deja exists

Long-running systems repeat work unless memory is made explicit.

deja captures what mattered after execution, so future runs can begin informed rather than reactive.

## Safety and control

All entries in deja are:

- Traceable to a source run
- Auditable
- Removable
- Scoped by intent

Memory persists by choice, not by accident.

---

## Architecture

**Durable Object per user.** Each user gets isolated storage. Isolation by architecture, not access control.

**Two interfaces:**
- **RPC** (service binding) — direct method calls, no auth
- **HTTP** (CLI/standalone) — API key auth

```
service binding          HTTP + API key
      │                        │
      ▼                        ▼
┌──────────────────────────────────┐
│            DejaDO                │
│  ┌────────────────────────────┐  │
│  │  SQLite (entries, secrets) │  │
│  └────────────────────────────┘  │
│              │                   │
│              ▼                   │
│         Vectorize                │
│    (semantic retrieval)          │
└──────────────────────────────────┘
```

## Scopes

Entries are scoped:

| Scope | Visibility |
|-------|------------|
| `shared` | All agents for this user |
| `agent:<id>` | Specific agent |
| `session:<id>` | Specific session |

Callers declare which scopes they can access. deja filters accordingly.

---

## API

### Store an entry

```bash
curl -X POST https://deja.coey.dev/learn \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "when this is relevant",
    "learning": "what to recall",
    "confidence": 0.9,
    "scope": "shared"
  }'
```

### Retrieve relevant entries

```bash
curl -X POST https://deja.coey.dev/inject \
  -H "Content-Type: application/json" \
  -d '{
    "context": "describe the task",
    "scopes": ["shared", "agent:ralph"],
    "limit": 5,
    "format": "prompt"
  }'
```

### Query without tracking

```bash
curl -X POST https://deja.coey.dev/query \
  -H "Authorization: Bearer $KEY" \
  -d '{"text": "search term", "limit": 10}'
```

### Delete an entry

```bash
curl -X DELETE https://deja.coey.dev/learning/<id> \
  -H "Authorization: Bearer $KEY"
```

---

## RPC (service binding)

For internal callers (filepath, orchestrators):

```typescript
const deja = env.DEJA.get(env.DEJA.idFromName(userId));

await deja.inject(scopes, context, limit);
await deja.learn(scope, trigger, learning, confidence, source);
await deja.query(scopes, text, limit);
await deja.getLearnings(filter);
await deja.deleteLearning(id);
await deja.getStats();
```

---

## Development

```bash
bun install
bun run dev        # local
bun run test       # tests
bun run deploy     # deploy to Cloudflare
```

## Stack

- Cloudflare Workers + Durable Objects
- SQLite (DO storage)
- Vectorize (semantic retrieval)
- Workers AI (embeddings)
- Hono (HTTP routing)

---

*Recall, by design.*
