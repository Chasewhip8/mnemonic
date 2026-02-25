import { Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatDeleteResult } from '../format.ts'
import { mn } from './root.ts'

const confirm = Options.boolean('confirm').pipe(Options.withDefault(false))
const confidenceLt = Options.float('confidence-lt').pipe(Options.optional)
const notRecalledInDays = Options.integer('not-recalled-in-days').pipe(Options.optional)
const scope = Options.text('scope').pipe(Options.optional)

export const prune = Command.make(
	'prune',
	{ confirm, confidenceLt, notRecalledInDays, scope },
	({ confirm, confidenceLt, notRecalledInDays, scope }) =>
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
					return yield* Effect.fail(new Error('Bulk delete requires --confirm flag'))
				}

				if (Option.isNone(confidenceLt) && Option.isNone(notRecalledInDays) && Option.isNone(scope)) {
					yield* Console.error(
						'Error: At least one filter required (--confidence-lt, --not-recalled-in-days, or --scope)',
					)
					return yield* Effect.fail(
						new Error('At least one filter required (--confidence-lt, --not-recalled-in-days, or --scope)'),
					)
				}

				const client = yield* MnemonicClient
				const result = yield* client.learnings
					.deleteLearnings({
						urlParams: {
							confidence_lt: Option.getOrUndefined(confidenceLt),
						not_recalled_in_days: Option.getOrUndefined(notRecalledInDays),
							scope: Option.getOrUndefined(scope),
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

				yield* Console.log(formatDeleteResult(result))
			}).pipe(Effect.provide(clientLayer))
		}),
)
