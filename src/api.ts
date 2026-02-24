import { HttpApi } from '@effect/platform'
import { HealthApi } from './health/api'
import { LearningsApi } from './learnings/api'
import { SecretsApi } from './secrets/api'

export class Api extends HttpApi.make('mnemonic')
	.add(LearningsApi)
	.add(SecretsApi)
	.add(HealthApi) {}
