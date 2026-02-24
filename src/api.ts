import { HttpApi } from '@effect/platform';
import { LearningsApi } from './learnings/api';
import { SecretsApi } from './secrets/api';
import { StateApi } from './state/api';
import { HealthApi } from './health/api';

export class Api extends HttpApi.make('deja')
	.add(LearningsApi)
	.add(SecretsApi)
	.add(StateApi)
	.add(HealthApi) {}
