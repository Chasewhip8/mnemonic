import { Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatHealth } from '../format.ts'
import { mn } from './root.ts'

export const health = Command.make('health', {}, () =>
	Effect.flatMap(mn, ({ url, apiKey, json }) => {
		const layer = makeClientLayer({
			...(Option.isSome(url) && { url: url.value }),
			...(Option.isSome(apiKey) && { apiKey: apiKey.value }),
		})
		return MnemonicClient.pipe(
			Effect.flatMap((client) => client.health.healthCheck()),
			Effect.map((result) => (json ? JSON.stringify(result, null, 2) : formatHealth(result))),
			Effect.flatMap(Console.log),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, Option.getOrUndefined(url))).pipe(
					Effect.andThen(Effect.sync(() => process.exit(1))),
				),
			),
			Effect.provide(layer),
		)
	}),
).pipe(Command.withDescription('Check if the mnemonic server is reachable'))
