# deja

**Persistent memory for agents.** Agents learn from failures. Deja remembers.

## Quick Start

```bash
# Get context at session start (no auth needed)
curl -s -X POST https://deja.coey.dev/inject \
  -H "Content-Type: application/json" \
  -d '{"context": "describe your task", "format": "prompt", "limit": 5}'

# Store a learning (auth required)
curl -s -X POST https://deja.coey.dev/learn \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "when relevant", "learning": "what you learned", "confidence": 0.9}'
```

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | No | Service info |
| `POST /learn` | **Yes** | Store a learning |
| `GET /learnings` | No | List all (paginated) |
| `GET /learning/:id` | No | Get by ID |
| `DELETE /learning/:id` | **Yes** | Delete a learning |
| `POST /query` | No | Semantic search |
| `POST /inject` | No | Format for prompt injection |
| `GET /stats` | No | Memory statistics |

## Cleanup

Test data pollutes semantic search. Clean it up:

```bash
# List all learnings
curl -s "https://deja.coey.dev/learnings?limit=50"

# Delete garbage
curl -s -X DELETE "https://deja.coey.dev/learning/$ID" \
  -H "Authorization: Bearer $API_KEY"
```

## Self-Hosting

Requires Cloudflare account with Workers, D1, Vectorize, and Workers AI.

```bash
npm install
npx wrangler d1 create deja-db
npx wrangler vectorize create deja-index --dimensions=768 --metric=cosine
npx wrangler d1 execute deja-db --file=schema.sql --remote
npx wrangler secret put API_KEY
npx wrangler deploy
```

## Blog Post

Read the story: [I Asked an Agent What It Wanted. It Built deja.](https://coey.dev/deja)

## License

MIT
