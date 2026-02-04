import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const content = `# deja

> Persistent memory for agents. Open source Cloudflare Worker.

## Overview

deja is a durable recall layer for AI agents running on Cloudflare Workers. It captures learnings from agent runs, stores them with semantic embeddings, and injects relevant memories into future sessions.

## Core Concepts

- **Learnings**: Structured memories with trigger, learning, confidence, and scope
- **Scopes**: session:<id> (temporary), agent:<id> (agent-specific), shared (global)
- **Vector Search**: Semantic similarity via Cloudflare Vectorize + Workers AI

## API Endpoints

### POST /learn
Store a new learning.
\`\`\`json
{
  "trigger": "what triggers this memory",
  "learning": "what the agent learned",
  "confidence": 0.9,
  "scope": "shared",
  "reason": "optional context",
  "source": "optional source identifier"
}
\`\`\`

### POST /inject
Get relevant memories for a context. Returns formatted prompt injection.
\`\`\`json
{
  "context": "current task or situation",
  "scopes": ["shared", "agent:my-agent"],
  "limit": 5
}
\`\`\`

### POST /query
Semantic search over memories.
\`\`\`json
{
  "query": "search text",
  "scopes": ["shared"],
  "limit": 10
}
\`\`\`

### GET /stats
Returns counts of learnings and secrets by scope.

### GET /learnings?scope=shared
List learnings, optionally filtered by scope.

### DELETE /learning/:id
Delete a specific learning by ID.

## Authentication

All mutating endpoints require Bearer token authentication:
\`Authorization: Bearer YOUR_API_KEY\`

## Deployment

Deploy to your own Cloudflare account:
1. \`wrangler vectorize create deja-embeddings --dimensions 384 --metric cosine\`
2. \`wrangler secret put API_KEY\`
3. \`wrangler deploy\`

## Links

- GitHub: https://github.com/acoyfellow/deja
- Deploy: https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/deja
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
