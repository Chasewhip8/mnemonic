import { Args, Command, Options } from '@effect/cli'
import { Console, Effect, Option } from 'effect'
import { MnemonicClient } from '../../../mnemonic-client/src/index.ts'
import { formatApiError, makeClientLayer } from '../client.ts'
import { formatSecret, formatSecretDelete, formatSecretList, formatSecretSet } from '../format.ts'
import { mn } from './root.ts'

const name = Args.text({ name: 'name' })
const value = Args.text({ name: 'value' })
const scope = Options.text('scope').pipe(Options.optional)
const scopes = Options.text('scopes').pipe(Options.optional)

const makeLayerFromGlobals = (globals: {
	url: Option.Option<string>
	apiKey: Option.Option<string>
}) =>
	makeClientLayer({
		...Option.match(globals.url, {
			onNone: () => ({}),
			onSome: (url) => ({ url }),
		}),
		...Option.match(globals.apiKey, {
			onNone: () => ({}),
			onSome: (apiKey) => ({ apiKey }),
		}),
	})

const setCommand = Command.make('set', { name, value, scope }, ({ name, value, scope }) =>
	Effect.flatMap(mn, (globals) =>
		Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.secrets.setSecret({
				payload: {
					name,
					value,
					scope: Option.getOrUndefined(scope),
				},
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatSecretSet(name))
		}).pipe(
			Effect.provide(makeLayerFromGlobals(globals)),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, Option.getOrUndefined(globals.url))).pipe(
					Effect.andThen(Effect.fail(error)),
				),
			),
		),
	),
)

const getCommand = Command.make('get', { name, scopes }, ({ name, scopes }) =>
	Effect.flatMap(mn, (globals) =>
		Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.secrets.getSecret({
				path: { name },
				urlParams: { scopes: Option.getOrUndefined(scopes) },
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatSecret(result))
		}).pipe(
			Effect.provide(makeLayerFromGlobals(globals)),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, Option.getOrUndefined(globals.url))).pipe(
					Effect.andThen(Effect.fail(error)),
				),
			),
		),
	),
)

const rmCommand = Command.make('rm', { name, scope }, ({ name, scope }) =>
	Effect.flatMap(mn, (globals) =>
		Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.secrets.deleteSecret({
				path: { name },
				urlParams: {
					scope: Option.getOrUndefined(scope),
				},
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatSecretDelete(name))
		}).pipe(
			Effect.provide(makeLayerFromGlobals(globals)),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, Option.getOrUndefined(globals.url))).pipe(
					Effect.andThen(Effect.fail(error)),
				),
			),
		),
	),
)

const listCommand = Command.make('list', { scope }, ({ scope }) =>
	Effect.flatMap(mn, (globals) =>
		Effect.gen(function* () {
			const client = yield* MnemonicClient
			const result = yield* client.secrets.listSecrets({
				urlParams: {
					scope: Option.getOrUndefined(scope),
				},
			})

			if (globals.json) {
				yield* Console.log(JSON.stringify(result, null, 2))
				return
			}

			yield* Console.log(formatSecretList(result))
		}).pipe(
			Effect.provide(makeLayerFromGlobals(globals)),
			Effect.catchAll((error) =>
				Console.error(formatApiError(error, Option.getOrUndefined(globals.url))).pipe(
					Effect.andThen(Effect.fail(error)),
				),
			),
		),
	),
)

export const secret = Command.make('secret').pipe(
	Command.withSubcommands([setCommand, getCommand, rmCommand, listCommand]),
)
