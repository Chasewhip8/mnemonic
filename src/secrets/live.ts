import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { Api } from '../api'
import { DatabaseError, NotFoundError } from '../errors'
import { SecretsRepo } from './repo'

export const SecretsApiLive = HttpApiBuilder.group(Api, 'secrets', (handlers) =>
	handlers
		.handle('setSecret', ({ payload }) =>
			Effect.gen(function* () {
				const repo = yield* SecretsRepo
				yield* repo.setSecret(payload.scope ?? 'shared', payload.name, payload.value)
				return { success: true as const }
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('getSecret', ({ path, urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* SecretsRepo
				const scopes = urlParams.scopes ? urlParams.scopes.split(',') : ['shared']
				const result = yield* repo
					.getSecret(scopes, path.name)
					.pipe(Effect.mapError((cause) => new DatabaseError({ cause })))
				if (result === null) {
					return yield* new NotFoundError({ message: 'not found' })
				}
				return { value: result }
			}),
		)
		.handle('deleteSecret', ({ path, urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* SecretsRepo
				const scope = urlParams.scope ?? 'shared'
				yield* repo.deleteSecret(scope, path.name)
				return { success: true as const }
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		)
		.handle('listSecrets', ({ urlParams }) =>
			Effect.gen(function* () {
				const repo = yield* SecretsRepo
				return yield* repo.listSecrets(urlParams.scope)
			}).pipe(Effect.mapError((cause) => new DatabaseError({ cause }))),
		),
)
