import { Config, Effect } from 'effect';

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
	effect: Effect.gen(function* () {
		const port = yield* Config.integer('PORT').pipe(Config.withDefault(8787));
		const apiKey = yield* Config.option(Config.redacted('API_KEY'));
		const dbPath = yield* Config.string('DB_PATH').pipe(
			Config.withDefault('./data/deja.db')
		);

		return {
			port,
			apiKey,
			dbPath,
		};
	}),
}) {}
