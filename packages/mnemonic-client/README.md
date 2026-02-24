# mnemonic-client

Effect-based client for [mnemonic](https://github.com/acoyfellow/mnemonic) — persistent memory for agents.

## Install

```bash
npm install mnemonic-client
# or
bun add mnemonic-client
```

## Usage

`MnemonicClient` is an [Effect Service](https://effect.website/docs/guides/context-management/services). Use it inside `Effect.gen`:

```ts
import { MnemonicClient } from 'mnemonic-client'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const client = yield* MnemonicClient

  // Store a learning
  yield* client.learnings.learn({
    payload: { trigger: 'deploy failed', learning: 'check wrangler.toml' },
  })

  // Get relevant memories for context
  const result = yield* client.learnings.inject({
    payload: { context: 'deploying to production' },
  })

  return result
})

Effect.runPromise(
  program.pipe(Effect.provide(MnemonicClient.Default))
)
```

## Config

Config is read from environment variables:

| Variable | Default | Description |
|---|---|---|
| `MNEMONIC_URL` | `http://localhost:8787` | Base URL of your mnemonic instance |
| `MNEMONIC_API_KEY` | _(none)_ | Bearer token for authenticated endpoints |

To override in tests or scripts, use `ConfigProvider.fromMap`:

```ts
import { ConfigProvider, Layer } from 'effect'

const testConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(new Map([
    ['MNEMONIC_URL', 'https://mnemonic.example.com'],
    ['MNEMONIC_API_KEY', 'my-secret-key'],
  ]))
)

Effect.runPromise(
  program.pipe(
    Effect.provide(MnemonicClient.Default),
    Effect.provide(testConfig),
  )
)
```

## Method Pattern

All methods take a single options object:

```ts
client.{group}.{method}({
  payload?,    // request body
  path?,       // path params, e.g. { id: "abc123" }
  urlParams?,  // query string params
})
```

## Endpoints

### `client.learnings.*`

| Method | Description |
|---|---|
| `learn({ payload })` | Store a learning |
| `inject({ payload })` | Get relevant memories for context |
| `injectTrace({ payload })` | Inject with debug trace |
| `query({ payload })` | Semantic search |
| `getLearnings({ urlParams? })` | List all learnings |
| `deleteLearnings({ urlParams })` | Bulk delete (requires at least one filter: `confidence_lt`, `not_recalled_in_days`, or `scope`) |
| `deleteLearning({ path })` | Delete by ID |
| `getLearningNeighbors({ path })` | Find similar learnings |
| `getStats()` | Get statistics |

### `client.state.*`

| Method | Description |
|---|---|
| `getState({ path })` | Get working state for a run |
| `upsertState({ path, payload })` | Create or replace state |
| `patchState({ path, payload })` | Partial update |
| `addStateEvent({ path, payload })` | Append an event |
| `resolveState({ path, payload })` | Mark run resolved |

### `client.secrets.*`

| Method | Description |
|---|---|
| `setSecret({ payload })` | Store a secret |
| `getSecret({ path })` | Retrieve by name |
| `deleteSecret({ path })` | Delete by name |
| `listSecrets()` | List all secret names |

### `client.health.*`

| Method | Description |
|---|---|
| `healthCheck()` | Health check (no auth required) |
| `cleanup({ payload? })` | Clean up old learnings (requires auth) |

## Types

```ts
import {
  type Learning,
  type Secret,
  type WorkingStatePayload,
  type WorkingStateResponse,
  type InjectResult,
  type InjectTraceResult,
  type QueryResult,
  type Stats,
  // error types
  type DatabaseError,
  type EmbeddingError,
  type NotFoundError,
  type Unauthorized,
  type ValidationError,
  // for building custom clients
  type Api,
} from 'mnemonic-client'
```

All types are derived from Effect schemas — no manual interfaces.

## License

MIT
