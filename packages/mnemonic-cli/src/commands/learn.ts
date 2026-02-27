import { Args, Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatLearning } from '../format.ts'
import { mn } from './root.ts'

const trigger = Args.text({ name: 'trigger' })
const learning = Args.text({ name: 'learning' })
const scope = Options.text('scope').pipe(Options.withDescription('Scope to store the learning under'), Options.optional)
const reason = Options.text('reason').pipe(Options.optional)
const source = Options.text('source').pipe(Options.optional)

export const learn = Command.make(
	'learn',
	{ trigger, learning, scope, reason, source },
	({ trigger, learning, scope, reason, source }) =>
		Effect.flatMap(mn, (globals) => {
			const url = Option.getOrUndefined(globals.url)
			const apiKey = Option.getOrUndefined(globals.apiKey)
			const clientOptions = {
				...(url !== undefined ? { url } : {}),
				...(apiKey !== undefined ? { apiKey } : {}),
			}
			const payload = {
				trigger,
				learning,
				...(Option.isSome(scope) ? { scope: Option.getOrUndefined(scope) } : {}),
				...(Option.isSome(reason) ? { reason: Option.getOrUndefined(reason) } : {}),
				...(Option.isSome(source) ? { source: Option.getOrUndefined(source) } : {}),
			}

			return Effect.gen(function* () {
				const client = yield* MnemonicClient
				const result = yield* client.learnings.learn({ payload })
				if (globals.json) {
					yield* Console.log(JSON.stringify(result, null, 2))
					return
				}
				yield* Console.log(formatLearning(result))
			}).pipe(
				Effect.provide(makeClientLayer(clientOptions)),
				Effect.catchAll((error) =>
					Console.error(formatApiError(error, url)).pipe(
						Effect.andThen(Effect.sync(() => process.exit(1))),
					),
				),
			)
		}),
).pipe(Command.withDescription('Store a new learning with a trigger phrase'))
