import { Args, Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { mn } from './root.ts'

const id = Args.text({ name: 'id' })

export const forget = Command.make('forget', { id }, ({ id }) =>
	Effect.flatMap(mn, (globals) => {
		const url = Option.getOrUndefined(globals.url)
		const apiKey = Option.getOrUndefined(globals.apiKey)
		const clientLayer = makeClientLayer({
			...(url === undefined ? {} : { url }),
			...(apiKey === undefined ? {} : { apiKey }),
		})

		return Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.learnings
				.deleteLearning({ path: { id } })
				.pipe(
					Effect.catchAll((error) =>
						Console.error(formatApiError(error, url)).pipe(Effect.andThen(Effect.fail(error))),
					),
				)

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(`Deleted learning ${id}`)
		}).pipe(Effect.provide(clientLayer))
	}),
)
