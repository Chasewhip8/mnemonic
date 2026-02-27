import { Args, Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatQueryResult } from '../format.ts'
import { mn } from './root.ts'

const text = Args.text({ name: 'text' })
const scopes = Options.text('scopes').pipe(Options.withDescription('Comma-separated list of scopes to search (e.g. "project,shared")'), Options.optional)
const limit = Options.integer('limit').pipe(Options.optional)

const parseScopes = (value: Option.Option<string>): Array<string> | undefined =>
	Option.match(value, {
		onNone: () => undefined,
		onSome: (raw) =>
			raw
				.split(',')
				.map((scope) => scope.trim())
				.filter((scope) => scope.length > 0),
	})

export const query = Command.make('query', { text, scopes, limit }, ({ text, scopes, limit }) =>
	Effect.flatMap(mn, (globals) => {
		const url = Option.getOrUndefined(globals.url)
		const apiKey = Option.getOrUndefined(globals.apiKey)
		const clientOptions = {
			...(url !== undefined ? { url } : {}),
			...(apiKey !== undefined ? { apiKey } : {}),
		}

		return Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.learnings.query({
				payload: {
					text,
					scopes: parseScopes(scopes),
					limit: Option.getOrUndefined(limit),
				},
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatQueryResult(result))
		}).pipe(
			Effect.provide(makeClientLayer(clientOptions)),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, url)).pipe(
					Effect.andThen(Effect.sync(() => process.exit(1))),
				),
			),
		)
	}),
).pipe(Command.withDescription('Semantic search across all learnings'))
