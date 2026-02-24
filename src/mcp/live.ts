import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../api';

export const McpApiLive = HttpApiBuilder.group(Api, 'mcp', (handlers) =>
	handlers
		.handle('handleMcp', ({ payload }) => Effect.succeed(payload))
		.handle('getMcpInfo', () =>
			Effect.succeed({
				name: 'deja',
				version: '1.0.0',
				description: 'Persistent memory for agents.',
				protocol: 'mcp',
				endpoint: '/mcp',
				tools: [],
			})
		),
);