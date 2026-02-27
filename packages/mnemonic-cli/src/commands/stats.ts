import { Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatStats } from '../format.ts'
import { mn } from './root.ts'

export const stats = Command.make('stats', {}, () =>
	Effect.flatMap(mn, (globals) => {
		const url = Option.getOrUndefined(globals.url)
		const apiKey = Option.getOrUndefined(globals.apiKey)
		const clientLayer = makeClientLayer({
			...(url === undefined ? {} : { url }),
			...(apiKey === undefined ? {} : { apiKey }),
		})

		return Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.learnings.getStats()

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatStats(result))
		}).pipe(
			Effect.provide(clientLayer),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, url)).pipe(
					Effect.andThen(Effect.sync(() => process.exit(1))),
				),
			),
		)
	}),
)
