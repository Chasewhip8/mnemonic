import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema } from 'effect';
import { DatabaseError } from '../errors';
import { Authorization } from '../security';

const HealthResponse = Schema.Struct({
	status: Schema.String,
	service: Schema.String,
});

const CleanupResponse = Schema.Struct({
	deleted: Schema.Number,
	reasons: Schema.Array(Schema.String),
});

export class HealthApi extends HttpApiGroup.make('health')
	.add(
		HttpApiEndpoint.get('healthCheck', '/')
			.addSuccess(HealthResponse)
	)
	.add(
		HttpApiEndpoint.post('cleanup', '/cleanup')
			.addSuccess(CleanupResponse)
			.addError(DatabaseError)
			.middleware(Authorization)
	) {}
