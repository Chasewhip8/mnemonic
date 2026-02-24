import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform'
import { Effect, Equivalence, Layer, Option, Redacted } from 'effect'
import { AppConfig } from './config'
import { Unauthorized } from './errors'

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()('Authorization', {
	failure: Unauthorized,
	security: {
		myBearer: HttpApiSecurity.bearer,
	},
}) {}

export const AuthorizationLive = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const { apiKey } = yield* AppConfig

		if (Option.isNone(apiKey)) {
			yield* Effect.log('API_KEY unset — auth disabled, all requests pass through')
			return {
				myBearer: () => Effect.void,
			}
		}

		const key = apiKey.value
		const apiKeyEquivalence = Redacted.getEquivalence(Equivalence.string)

		yield* Effect.log('API_KEY set — bearer auth enabled')

		return {
			myBearer: (bearerToken: Redacted.Redacted<string>) =>
				Effect.gen(function* () {
					if (!apiKeyEquivalence(key, bearerToken)) {
						return yield* new Unauthorized()
					}
				}),
		}
	}),
)
