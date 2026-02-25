import { Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatCleanup } from '../format.ts'
import { mn } from './root.ts'

export const cleanup = Command.make('cleanup', {}, () =>
	Effect.flatMap(mn, ({ url, apiKey, json }) => {
		const layer = makeClientLayer({
			...(Option.isSome(url) && { url: url.value }),
			...(Option.isSome(apiKey) && { apiKey: apiKey.value }),
		})
		return MnemonicClient.pipe(
			Effect.flatMap((client) => client.health.cleanup()),
			Effect.map((result) => (json ? JSON.stringify(result) : formatCleanup(result))),
			Effect.flatMap(Console.log),
			Effect.catchAll((error) => Console.error(formatApiError(error, Option.getOrUndefined(url)))),
			Effect.provide(layer),
		)
	}),
)
