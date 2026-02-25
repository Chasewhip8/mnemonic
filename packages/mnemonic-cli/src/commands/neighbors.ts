import { Args, Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatNeighbors } from '../format.ts'
import { mn } from './root.ts'

const id = Args.text({ name: 'id' })
const threshold = Options.float('threshold').pipe(Options.optional)
const limit = Options.integer('limit').pipe(Options.optional)

export const neighbors = Command.make(
	'neighbors',
	{ id, threshold, limit },
	({ id, threshold, limit }) =>
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
					.getLearningNeighbors({
						path: { id },
						urlParams: {
							threshold: Option.getOrUndefined(threshold),
							limit: Option.getOrUndefined(limit),
						},
					})
					.pipe(
						Effect.catchAll((error) =>
							Console.error(formatApiError(error, url)).pipe(Effect.andThen(Effect.fail(error))),
						),
					)

				if (globals.json) {
					yield* Console.log(JSON.stringify(result, null, 2))
					return
				}

				yield* Console.log(formatNeighbors(result))
			}).pipe(Effect.provide(clientLayer))
		}),
)
