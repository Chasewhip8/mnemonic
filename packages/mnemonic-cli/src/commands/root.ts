import { Command, Options } from '@effect/cli'
import { Console } from 'effect'

const url = Options.text('url').pipe(Options.optional)
const apiKey = Options.text('api-key').pipe(Options.optional)
const json = Options.boolean('json').pipe(Options.withDefault(false))

export const mn = Command.make('mn', { url, apiKey, json }, (_globals) =>
	Console.log('Run `mn --help` for usage.'),
)
