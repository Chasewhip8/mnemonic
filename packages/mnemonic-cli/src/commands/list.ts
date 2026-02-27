import { Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatLearningList } from '../format.ts'
import { mn } from './root.ts'

const scope = Options.text('scope').pipe(Options.optional)
const limit = Options.integer('limit').pipe(Options.optional)

export const list = Command.make('list', { scope, limit }, ({ scope, limit }) =>
	Effect.flatMap(mn, (globals) => {
		const url = Option.getOrUndefined(globals.url)
		const apiKey = Option.getOrUndefined(globals.apiKey)
		const clientLayer = makeClientLayer({
			...(url === undefined ? {} : { url }),
			...(apiKey === undefined ? {} : { apiKey }),
		})

		return Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.learnings.getLearnings({
				urlParams: {
					scope: Option.getOrUndefined(scope),
					limit: Option.getOrUndefined(limit),
				},
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatLearningList(result))
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
