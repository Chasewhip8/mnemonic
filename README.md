# deja

*What survives a run.*

deja is a self-hosted memory layer for agents.
It exposes durable memory via REST + MCP, with scoped recall and optional live working state.

## Local references

- **Runtime API**: `src/index.ts`
- **Service logic**: `src/service.ts`
- **Schema source of truth**: `src/schema.ts`
- **DB migrations**: `drizzle/`

---

## Minimal deploy

```bash
git clone https://github.com/acoyfellow/deja
cd deja
bun install
wrangler login
wrangler vectorize create deja-embeddings --dimensions 384 --metric cosine
wrangler secret put API_KEY
bun run deploy
```

---

## Minimal MCP config (agent-agnostic)

Any MCP-capable agent can connect to:

- Endpoint: `https://<your-host>/mcp`
- Header: `Authorization: Bearer <API_KEY>`

Example:

```json
{
  "mcpServers": {
    "deja": {
      "type": "http",
      "url": "https://deja.your-subdomain.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${DEJA_API_KEY}"
      }
    }
  }
}
```

---

## Core API surface

- Memory: `/learn`, `/inject`, `/inject/trace`, `/query`, `/learnings`, `/learning/:id`, `/learning/:id/neighbors`, `/stats`, `DELETE /learning/:id`, `DELETE /learnings`
- Working state: `/state/:runId`, `/state/:runId/events`, `/state/:runId/resolve`
- Secrets: `/secret`, `/secret/:name`, `/secrets`

Learnings include `last_recalled_at`, `recall_count` for tracking. Bulk delete: `DELETE /learnings?confidence_lt=0.5` or `?not_recalled_in_days=90` or `?scope=shared` (requires at least one filter).
