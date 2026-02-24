import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Layer } from 'effect';
import { AppConfig } from './config';
import { HttpLive } from './http';
import { AuthorizationLive } from './security';
import { AppLive } from './services';

HttpLive.pipe(
	Layer.provide(AppLive),
	Layer.provide(AuthorizationLive),
	Layer.provide(AppConfig.Default),
	Layer.launch,
	BunRuntime.runMain,
);