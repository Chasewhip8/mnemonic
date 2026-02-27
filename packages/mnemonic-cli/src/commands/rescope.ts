import { Args, Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatLearning } from '../format.ts'
import { mn } from './root.ts'

const id = Args.text({ name: 'id' })
const scope = Args.text({ name: 'scope' })

export const rescope = Command.make('rescope', { id, scope }, ({ id, scope }) =>
	Effect.flatMap(mn, (globals) => {
		const url = Option.getOrUndefined(globals.url)
		const apiKey = Option.getOrUndefined(globals.apiKey)
		const clientLayer = makeClientLayer({
			...(url === undefined ? {} : { url }),
			...(apiKey === undefined ? {} : { apiKey }),
		})

		return Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.learnings.updateScope({
				path: { id },
				payload: { scope },
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatLearning(result))
		}).pipe(
			Effect.provide(clientLayer),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, url)).pipe(
					Effect.andThen(Effect.sync(() => process.exit(1))),
				),
			),
		)
	}),
).pipe(Command.withDescription('Change the scope of an existing learning'))
