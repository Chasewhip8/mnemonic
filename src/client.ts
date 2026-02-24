import { FetchHttpClient, HttpApiClient, HttpClient, HttpClientRequest } from '@effect/platform'
import { Config, Effect, Option, Redacted } from 'effect'
import { Api } from './api'

export { Api } from './api'
export {
	DatabaseError,
	EmbeddingError,
	NotFoundError,
	Unauthorized,
	ValidationError,
} from './errors'
export {
	InjectResult,
	InjectTraceResult,
	Learning,
	QueryResult,
	Secret,
	Stats,
	WorkingStatePayload,
	WorkingStateResponse,
} from './domain'

export class MnemonicClient extends Effect.Service<MnemonicClient>()('MnemonicClient', {
	effect: Effect.gen(function* () {
		const baseUrl = yield* Config.string('MNEMONIC_URL').pipe(
			Config.withDefault('http://localhost:8787'),
		)
		const apiKey = yield* Config.option(Config.redacted('MNEMONIC_API_KEY'))
		return yield* HttpApiClient.make(Api, {
			baseUrl,
			transformClient: Option.isSome(apiKey)
				? HttpClient.mapRequest(HttpClientRequest.bearerToken(Redacted.value(apiKey.value)))
				: undefined,
		})
	}),
	dependencies: [FetchHttpClient.layer],
}) {}
