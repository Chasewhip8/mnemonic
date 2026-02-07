import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const content = `# deja

> Persistent memory for agents. MCP-native. Open source Cloudflare Worker.

## TL;DR for Agents

Connect via MCP at \`/mcp\` endpoint. You get these tools:
- \`learn\` — Store a memory (trigger + learning)
- \`inject\` — Get relevant memories for current context
- \`query\` — Search memories semantically
- \`forget\` — Delete a memory
- \`list\` — List memories by scope
- \`stats\` — Get memory statistics

## MCP Connection

deja speaks Model Context Protocol (MCP) natively. Connect any MCP client:

Endpoint: \`https://your-deja-instance.workers.dev/mcp\`
Transport: HTTP (JSON-RPC 2.0)

### MCP Tool Schemas

#### learn
Store a learning for future recall.
\`\`\`json
{
  "trigger": "when this applies",
  "learning": "what was learned",
  "confidence": 0.8,
  "scope": "shared",
  "reason": "optional why",
  "source": "optional source"
}
\`\`\`

#### inject
Get relevant memories for current context.
\`\`\`json
{
  "context": "what you're about to do",
  "scopes": ["shared"],
  "limit": 5
}
\`\`\`

#### query
Search memories semantically.
\`\`\`json
{
  "query": "search text",
  "scopes": ["shared"],
  "limit": 10
}
\`\`\`

#### forget
Delete a specific learning.
\`\`\`json
{
  "id": "learning-id"
}
\`\`\`

#### list
List memories by scope.
\`\`\`json
{
  "scope": "shared",
  "limit": 20
}
\`\`\`

## Core Concepts

- **Learnings**: Structured memories with trigger, learning, confidence, and scope
- **Scopes**: session:<id> (expires 7d), agent:<id> (expires 30d), shared (persistent)
- **Vector Search**: Semantic similarity via Cloudflare Vectorize
- **Auto-cleanup**: Low confidence (<0.3) memories are auto-deleted

## REST API (Alternative)

If MCP isn't available, use REST:

### POST /learn
Store a new learning.

### POST /inject
Get relevant memories for context injection.

### POST /query
Semantic search over memories.

### GET /stats
Memory statistics by scope.

### GET /learnings?scope=shared
List learnings, optionally filtered.

### DELETE /learning/:id
Delete a specific learning.

## Authentication

Mutating endpoints require: \`Authorization: Bearer YOUR_API_KEY\`

## Deployment

Deploy your own instance:
\`\`\`bash
wrangler vectorize create deja-embeddings --dimensions 384 --metric cosine
wrangler secret put API_KEY
wrangler deploy
\`\`\`

## Links

- GitHub: https://github.com/acoyfellow/deja
- Deploy: https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/deja
- Docs: https://deja.coey.dev/docs
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
