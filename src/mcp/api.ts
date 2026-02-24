import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema } from 'effect';
import { Authorization } from '../security';

const McpInfoResponse = Schema.Struct({
	name: Schema.String,
	version: Schema.String,
	description: Schema.String,
	protocol: Schema.String,
	endpoint: Schema.String,
	tools: Schema.Array(Schema.String),
});

export class McpApi extends HttpApiGroup.make('mcp')
	.add(
		HttpApiEndpoint.post('handleMcp', '/mcp')
			.setPayload(Schema.Unknown)
			.addSuccess(Schema.Unknown)
	)
	.add(
		HttpApiEndpoint.get('getMcpInfo', '/mcp')
			.addSuccess(McpInfoResponse)
	)
	.middleware(Authorization) {}
