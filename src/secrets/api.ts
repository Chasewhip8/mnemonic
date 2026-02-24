import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema } from 'effect';
import { Secret } from '../domain';
import { DatabaseError, NotFoundError, ValidationError } from '../errors';
import { Authorization } from '../security';

const SetSecretBody = Schema.Struct({
	name: Schema.String,
	value: Schema.String,
	scope: Schema.optional(Schema.String),
});

const SecretResponse = Schema.Struct({
	success: Schema.Boolean,
	error: Schema.optional(Schema.String),
});

const GetSecretResponse = Schema.Struct({
	value: Schema.String,
});

export class SecretsApi extends HttpApiGroup.make('secrets')
	.add(
		HttpApiEndpoint.post('setSecret', '/secret')
			.setPayload(SetSecretBody)
			.addSuccess(SecretResponse)
			.addError(DatabaseError)
			.addError(ValidationError)
	)
	.add(
		HttpApiEndpoint.get('getSecret', '/secret/:name')
			.setPath(Schema.Struct({ name: Schema.String }))
			.setUrlParams(Schema.Struct({
				scopes: Schema.optional(Schema.String),
			}))
			.addSuccess(GetSecretResponse)
			.addError(NotFoundError)
			.addError(DatabaseError)
	)
	.add(
		HttpApiEndpoint.del('deleteSecret', '/secret/:name')
			.setPath(Schema.Struct({ name: Schema.String }))
			.setUrlParams(Schema.Struct({
				scope: Schema.optional(Schema.String),
			}))
			.addSuccess(SecretResponse)
			.addError(NotFoundError)
			.addError(DatabaseError)
	)
	.add(
		HttpApiEndpoint.get('listSecrets', '/secrets')
			.setUrlParams(Schema.Struct({
				scope: Schema.optional(Schema.String),
			}))
			.addSuccess(Schema.Array(Secret))
			.addError(DatabaseError)
	)
	.middleware(Authorization) {}
