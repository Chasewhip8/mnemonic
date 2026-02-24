import type { Config as DrizzleConfig } from 'drizzle-kit'
import { Config, Effect } from 'effect'

const DbCredentialsConfig = Config.all({
	url: Config.string('DB_PATH').pipe(Config.withDefault('./data/mnemonic.db')),
})

export const dbCredentials = Effect.runSync(DbCredentialsConfig)

export default {
	schema: './src/database/schema/*',
	out: './src/database/migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: `file:${dbCredentials.url}`,
	},
	strict: true,
	verbose: true,
} satisfies DrizzleConfig
