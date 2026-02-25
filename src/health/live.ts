import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { Api } from '../api'
import { CleanupService } from '../cleanup'

export const HealthHandlers = HttpApiBuilder.group(Api, 'health', (handlers) =>
	handlers
		.handle('healthCheck', () =>
			Effect.succeed({ status: 'ok', service: 'mnemonic' }),
		)
		.handle('cleanup', () =>
			Effect.gen(function* () {
				const svc = yield* CleanupService
				return yield* svc.runCleanup()
			}),
		),
)
