import { HttpApiBuilder, HttpMiddleware, HttpServer } from '@effect/platform'
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer'
import { Effect, Layer } from 'effect'
import { Api } from './api'
import { AppConfig } from './config'
import { HealthHandlers } from './health/live'
import { LearningsApiLive } from './learnings/live'

const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide(LearningsApiLive),
	Layer.provide(HealthHandlers),
)

const ServerLive = Layer.unwrapEffect(
	Effect.map(AppConfig, ({ port }) => BunHttpServer.layer({ port })),
)

export const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	Layer.provide(HttpApiBuilder.middlewareCors()),
	Layer.provide(ApiLive),
	HttpServer.withLogAddress,
	Layer.provide(ServerLive),
)
