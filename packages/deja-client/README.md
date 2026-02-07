# deja-client

Thin client for [deja](https://github.com/acoyfellow/deja) — persistent memory for agents.

## Install

```bash
npm install deja-client
# or
bun add deja-client
```

## Usage

```ts
import deja from 'deja-client'

const mem = deja('https://deja.coey.dev')

// Store a learning
await mem.learn('deploy failed', 'check wrangler.toml first')

// Get relevant memories before a task
const { prompt, learnings } = await mem.inject('deploying to production')

// Search memories
const results = await mem.query('wrangler config')

// List all memories
const all = await mem.list()

// Delete a memory
await mem.forget('1234567890-abc123def')

// Get stats
const stats = await mem.stats()
```

## Types

All types are exported for use in your application:

```ts
import deja, { type Learning, type InjectResult, type QueryResult, type Stats } from 'deja-client'
```

### `Learning`

The core memory type returned by most methods:

```ts
interface Learning {
  id: string          // Unique identifier
  trigger: string     // When this memory applies
  learning: string    // What was learned
  reason?: string     // Why this was learned
  confidence: number  // 0-1 confidence score
  source?: string     // Source identifier
  scope: string       // "shared", "agent:<id>", or "session:<id>"
  createdAt: string   // ISO timestamp
}
```

### `InjectResult`

Returned by `mem.inject()`:

```ts
interface InjectResult {
  prompt: string        // Formatted prompt text
  learnings: Learning[] // Raw learnings
}
```

### `QueryResult`

Returned by `mem.query()`:

```ts
interface QueryResult {
  learnings: Learning[]
  hits: Record<string, number> // Hits per scope
}
```

### `Stats`

Returned by `mem.stats()`:

```ts
interface Stats {
  totalLearnings: number
  totalSecrets: number
  scopes: Record<string, { learnings: number; secrets: number }>
}
```

## API

### `deja(url, options?)`

Create a client instance.

- `url` — Your deja instance URL
- `options.apiKey` — API key for authenticated endpoints
- `options.fetch` — Custom fetch implementation

### `mem.learn(trigger, learning, options?)`

Store a learning for future recall.

- `trigger` — When this learning applies
- `learning` — What was learned
- `options.confidence` — 0-1 (default: 0.8)
- `options.scope` — `shared`, `agent:<id>`, or `session:<id>` (default: `shared`)
- `options.reason` — Why this was learned
- `options.source` — Source identifier

### `mem.inject(context, options?)`

Get relevant memories for current context.

- `context` — Current task or situation
- `options.scopes` — Scopes to search (default: `['shared']`)
- `options.limit` — Max memories (default: 5)
- `options.format` — `'prompt'` or `'learnings'` (default: `'prompt'`)

### `mem.query(text, options?)`

Search memories semantically.

- `text` — Search query
- `options.scopes` — Scopes to search (default: `['shared']`)
- `options.limit` — Max results (default: 10)

### `mem.list(options?)`

List all memories.

- `options.scope` — Filter by scope
- `options.limit` — Max results

### `mem.forget(id)`

Delete a specific memory by ID.

### `mem.stats()`

Get memory statistics.

## License

MIT
