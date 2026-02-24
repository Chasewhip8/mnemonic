/**
 * deja-client - Effect-based client for deja persistent memory
 *
 * @example Effect-based usage
 * ```ts
 * import { DejaClient } from 'deja-client'
 * import { Effect } from 'effect'
 * import { FetchHttpClient } from '@effect/platform'
 *
 * const program = Effect.gen(function* () {
 *   const client = yield* DejaClient
 *   const learning = yield* client.learn('deploy failed', 'check wrangler.toml first')
 * })
 * ```
 *
 * @example Backward-compatible usage
 * ```ts
 * import deja from 'deja-client'
 *
 * const mem = deja('https://deja.your-subdomain.workers.dev')
 * await mem.learn('deploy failed', 'check wrangler.toml first')
 * ```
 */

import { FetchHttpClient, HttpClient, HttpClientRequest } from '@effect/platform'
import type { HttpClientResponse } from '@effect/platform'
import { Cause, Config, ConfigProvider, Effect, Exit, Layer, Option, Redacted } from 'effect'

// ============================================================================
// Types
// ============================================================================

export interface Learning {
  id: string
  trigger: string
  learning: string
  reason?: string
  confidence: number
  source?: string
  scope: string
  createdAt: string
}

export interface InjectResult {
  prompt: string
  learnings: Learning[]
}

export interface QueryResult {
  learnings: Learning[]
  hits: Record<string, number>
}

export interface Stats {
  totalLearnings: number
  totalSecrets: number
  scopes: Record<string, { learnings: number; secrets: number }>
}

export interface LearnOptions {
  confidence?: number
  scope?: string
  reason?: string
  source?: string
}

export interface InjectOptions {
  scopes?: string[]
  limit?: number
  format?: 'prompt' | 'learnings'
}

export interface QueryOptions {
  scopes?: string[]
  limit?: number
}

export interface ListOptions {
  scope?: string
  limit?: number
}

export interface ClientOptions {
  apiKey?: string
  fetch?: typeof fetch
}

// ============================================================================
// Effect-based Service
// ============================================================================

export class DejaClient extends Effect.Service<DejaClient>()('DejaClient', {
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient
    const baseUrl = yield* Config.string('DEJA_URL').pipe(Config.withDefault('http://localhost:8787'))
    const apiKey = yield* Config.option(Config.redacted('DEJA_API_KEY'))

    const withAuth = (req: HttpClientRequest.HttpClientRequest) =>
      Option.match(apiKey, {
        onNone: () => req,
        onSome: (key: Redacted.Redacted) => HttpClientRequest.bearerToken(req, Redacted.value(key)),
      })

    const handleError = (response: HttpClientResponse.HttpClientResponse) =>
      response.json.pipe(
        Effect.catchAll(() => Effect.succeed({ error: undefined })),
        Effect.flatMap((body) =>
          Effect.fail(new Error((body as { error?: string }).error || `HTTP ${response.status}`))
        ),
      )

    const postJson = <T>(path: string, body: unknown): Effect.Effect<T, Error> =>
      HttpClientRequest.post(`${baseUrl}${path}`).pipe(
        HttpClientRequest.bodyJson(body),
        Effect.map(withAuth),
        Effect.flatMap(httpClient.execute),
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? (response.json as Effect.Effect<T, never>)
            : handleError(response)
        ),
        Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e)))),
      )

    const getJson = <T>(path: string): Effect.Effect<T, Error> =>
      Effect.gen(function* () {
        const response = yield* httpClient.execute(
          withAuth(HttpClientRequest.get(`${baseUrl}${path}`))
        )
        if (response.status >= 200 && response.status < 300) {
          return (yield* response.json) as T
        }
        return yield* handleError(response)
      }).pipe(
        Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e)))),
      )

    const delJson = <T>(path: string): Effect.Effect<T, Error> =>
      Effect.gen(function* () {
        const response = yield* httpClient.execute(
          withAuth(HttpClientRequest.del(`${baseUrl}${path}`))
        )
        if (response.status >= 200 && response.status < 300) {
          return (yield* response.json) as T
        }
        return yield* handleError(response)
      }).pipe(
        Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e)))),
      )

    const learn = (trigger: string, learning: string, opts: LearnOptions = {}) =>
      postJson<Learning>('/learn', {
        trigger,
        learning,
        confidence: opts.confidence ?? 0.8,
        scope: opts.scope ?? 'shared',
        reason: opts.reason,
        source: opts.source,
      })

    const inject = (context: string, opts: InjectOptions = {}) =>
      postJson<InjectResult>('/inject', {
        context,
        scopes: opts.scopes ?? ['shared'],
        limit: opts.limit ?? 5,
        format: opts.format ?? 'prompt',
      })

    const query = (text: string, opts: QueryOptions = {}) =>
      postJson<QueryResult>('/query', {
        text,
        scopes: opts.scopes ?? ['shared'],
        limit: opts.limit ?? 10,
      })

    const list = (opts: ListOptions = {}) => {
      const params = new URLSearchParams()
      if (opts.scope) params.set('scope', opts.scope)
      if (opts.limit) params.set('limit', String(opts.limit))
      const qs = params.toString()
      return getJson<Learning[]>(`/learnings${qs ? `?${qs}` : ''}`)
    }

    const forget = (id: string) =>
      delJson<{ success: boolean; error?: string }>(`/learning/${id}`)

    const stats = () => getJson<Stats>('/stats')

    return { learn, inject, query, list, forget, stats }
  }),
}) {}

// ============================================================================
// Backward-compatible wrapper
// ============================================================================

/**
 * Create a deja client (backward-compatible Promise-based API)
 *
 * @param url - Your deja instance URL (e.g., https://deja.your-subdomain.workers.dev)
 * @param options - Optional: apiKey for authenticated endpoints, custom fetch
 */
export function deja(url: string, options: ClientOptions = {}) {
  const baseUrl = url.replace(/\/$/, '')

  const configProvider = ConfigProvider.fromMap(new Map(
    [
      ['DEJA_URL', baseUrl],
      ...(options.apiKey ? [['DEJA_API_KEY', options.apiKey] as const] : []),
    ] as Array<readonly [string, string]>
  ))

  const fetchLayer = options.fetch
    ? FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch))
      )
    : FetchHttpClient.layer

  const layer = DejaClient.Default.pipe(
    Layer.provide(fetchLayer),
    Layer.provide(Layer.setConfigProvider(configProvider)),
  )

  const run = <A>(eff: Effect.Effect<A, Error, DejaClient>): Promise<A> =>
    Effect.runPromiseExit(eff.pipe(Effect.provide(layer))).then((exit) => {
      if (Exit.isSuccess(exit)) return exit.value
      throw Cause.squash(exit.cause)
    })

  return {
    learn(trigger: string, learning: string, opts?: LearnOptions): Promise<Learning> {
      return run(DejaClient.use((c) => c.learn(trigger, learning, opts)))
    },

    inject(context: string, opts?: InjectOptions): Promise<InjectResult> {
      return run(DejaClient.use((c) => c.inject(context, opts)))
    },

    query(text: string, opts?: QueryOptions): Promise<QueryResult> {
      return run(DejaClient.use((c) => c.query(text, opts)))
    },

    list(opts?: ListOptions): Promise<Learning[]> {
      return run(DejaClient.use((c) => c.list(opts)))
    },

    forget(id: string): Promise<{ success: boolean; error?: string }> {
      return run(DejaClient.use((c) => c.forget(id)))
    },

    stats(): Promise<Stats> {
      return run(DejaClient.use((c) => c.stats()))
    },
  }
}

export default deja
