import { Args, Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatInjectResult, formatInjectTraceResult } from '../format.ts'
import { mn } from './root.ts'

const context = Args.text({ name: 'context' })
const scopes = Options.text('scopes').pipe(Options.optional)
const limit = Options.integer('limit').pipe(Options.optional)
const trace = Options.boolean('trace').pipe(Options.withDefault(false))
const threshold = Options.float('threshold').pipe(Options.optional)

const parseScopes = (value: Option.Option<string>): Array<string> | undefined =>
	Option.match(value, {
		onNone: () => undefined,
		onSome: (raw) =>
			raw
				.split(',')
				.map((scope) => scope.trim())
				.filter((scope) => scope.length > 0),
	})

export const recall = Command.make(
	'recall',
	{ context, scopes, limit, trace, threshold },
	({ context, scopes, limit, trace, threshold }) =>
		Effect.flatMap(mn, (globals) => {
			const url = Option.getOrUndefined(globals.url)
			const apiKey = Option.getOrUndefined(globals.apiKey)
			const clientOptions = {
				...(url !== undefined ? { url } : {}),
				...(apiKey !== undefined ? { apiKey } : {}),
			}
			const parsedScopes = parseScopes(scopes)

			return Effect.gen(function* () {
				const client = yield* MnemonicClient

				if (trace) {
					const result = yield* client.learnings.injectTrace({
						urlParams: {},
						payload: {
							context,
							scopes: parsedScopes,
							limit: Option.getOrUndefined(limit),
							threshold: Option.getOrUndefined(threshold),
						},
					})

					if (globals.json) {
						yield* Console.log(JSON.stringify(result, null, 2))
						return
					}

					yield* Console.log(formatInjectTraceResult(result))
					return
				}

				const result = yield* client.learnings.inject({
					payload: {
						context,
						scopes: parsedScopes,
						limit: Option.getOrUndefined(limit),
						threshold: Option.getOrUndefined(threshold),
					},
				})

				if (globals.json) {
					yield* Console.log(JSON.stringify(result, null, 2))
					return
				}

				yield* Console.log(formatInjectResult(result))
			}).pipe(
				Effect.provide(makeClientLayer(clientOptions)),
				Effect.catchAll((error) =>
					Console.error(formatApiError(error, url)).pipe(
						Effect.andThen(Effect.sync(() => process.exit(1))),
					),
				),
			)
		}),
)
