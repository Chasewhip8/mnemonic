import { Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatDeleteResult } from '../format.ts'
import { mn } from './root.ts'

const confirm = Options.boolean('confirm').pipe(Options.withDefault(false))
const notRecalledInDays = Options.integer('not-recalled-in-days').pipe(Options.optional)
const scope = Options.text('scope').pipe(Options.withDescription('Filter by scope'), Options.optional)

export const prune = Command.make(
	'prune',
	{ confirm, notRecalledInDays, scope },
	({ confirm, notRecalledInDays, scope }) =>
		Effect.flatMap(mn, (globals) => {
			const url = Option.getOrUndefined(globals.url)
			const apiKey = Option.getOrUndefined(globals.apiKey)
			const clientLayer = makeClientLayer({
				...(url === undefined ? {} : { url }),
				...(apiKey === undefined ? {} : { apiKey }),
			})

			return Effect.gen(function* () {
				if (!confirm) {
					yield* Console.error('Error: Bulk delete requires --confirm flag')
					return yield* Effect.sync(() => process.exit(1))
				}

				if (Option.isNone(notRecalledInDays) && Option.isNone(scope)) {
					yield* Console.error(
						'Error: At least one filter required (--not-recalled-in-days or --scope)',
					)
					return yield* Effect.sync(() => process.exit(1))
				}

				const client = yield* MnemonicClient
				const result = yield* client.learnings.deleteLearnings({
					urlParams: {
						not_recalled_in_days: Option.getOrUndefined(notRecalledInDays),
						scope: Option.getOrUndefined(scope),
					},
				})

				if (globals.json) {
					yield* Console.log(JSON.stringify(result, null, 2))
					return
				}

				yield* Console.log(formatDeleteResult(result))
			}).pipe(
				Effect.provide(clientLayer),
				Effect.catchAll((error) =>
					Console.error(formatApiError(error, url)).pipe(
						Effect.andThen(Effect.sync(() => process.exit(1))),
					),
				),
			)
		}),
).pipe(Command.withDescription('Bulk delete learnings by scope or staleness'))
