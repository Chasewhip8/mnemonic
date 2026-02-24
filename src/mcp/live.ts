import { HttpApiBuilder, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../api';
import { handleMcpRequest } from './handler';
import { MCP_TOOLS } from './tools';

export const McpApiLive = HttpApiBuilder.group(Api, 'mcp', (handlers) =>
	handlers
		.handle('handleMcp', ({ payload }) =>
			Effect.gen(function* () {
				const result = yield* handleMcpRequest(payload);
				if (result === null) {
					return yield* HttpServerResponse.empty({ status: 204 });
				}
				return result;
			})
		)
		.handle('getMcpInfo', ({ request }) =>
			Effect.succeed({
				name: 'deja',
				version: '1.0.0',
				description: 'Persistent memory for agents. Store learnings, recall context.',
				protocol: 'mcp',
				endpoint: `${new URL(request.url).origin}/mcp`,
				tools: MCP_TOOLS.map((tool) => tool.name),
			})
		)
);
