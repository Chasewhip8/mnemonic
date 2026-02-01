# deja

Persistent memory for agents. Scoped, isolated, bindable.

## Architecture

**Durable Object per user** - Each user gets their own DejaDO instance with SQLite storage. Isolation by architecture, not access control.

**Two interfaces:**
1. **RPC** (for filepath/internal) - Service binding, direct method calls, no auth needed
2. **HTTP** (for CLI/standalone) - API key auth, wraps the DO

```
filepath (service binding)     CLI/standalone (HTTP)
         │                              │
         │ RPC                          │ API key
         ▼                              ▼
    ┌─────────────────────────────────────┐
    │           DejaDO                    │
    │  ┌─────────────────────────────┐    │
    │  │  SQLite (learnings, secrets)│    │
    │  └─────────────────────────────┘    │
    │              │                      │
    │              ▼                      │
    │         Vectorize                   │
    │    (semantic search)                │
    └─────────────────────────────────────┘
```

## Scopes

Learnings and secrets are scoped:
- `shared` - visible to all agents for this user
- `agent:<id>` - specific to one agent
- `session:<id>` - specific to one session

Callers pass scopes they can access. DejaDO filters accordingly.

## RPC Methods (for service binding)

```typescript
const deja = env.DEJA.get(env.DEJA.idFromName(userId));

// Memory
await deja.inject(scopes, context, limit);  // Get relevant memories
await deja.learn(scope, trigger, learning, confidence, source);
await deja.query(scopes, text, limit);      // Search without tracking hits
await deja.getLearnings(filter);            // List/filter
await deja.deleteLearning(id);

// Secrets  
await deja.getSecret(scopes, name);         // First match wins
await deja.setSecret(scope, name, value);
await deja.deleteSecret(scope, name);

// Stats
await deja.getStats();
```

## HTTP Endpoints (for CLI)

Same operations, wrapped with API key auth:

```bash
# Inject memories into prompt
curl -X POST /inject -H "Authorization: Bearer $KEY" \
  -d '{"context": "building auth", "scopes": ["shared"], "limit": 5}'

# Learn something
curl -X POST /learn -H "Authorization: Bearer $KEY" \
  -d '{"trigger": "when X", "learning": "do Y", "confidence": 0.9}'

# Query
curl -X POST /query -H "Authorization: Bearer $KEY" \
  -d '{"text": "search term", "limit": 10}'
```

## Development

```bash
bun install
bun run dev        # Local dev
bun run test       # Run tests
bun run deploy     # Deploy to Cloudflare
```

## Stack

- Cloudflare Workers + Durable Objects
- SQLite (DO storage)
- Vectorize (semantic search)
- Workers AI (embeddings)
- Hono (HTTP routing)
