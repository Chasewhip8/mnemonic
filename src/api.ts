import { HttpApi } from '@effect/platform'
import { HealthApi } from './health/api'
import { LearningsApi } from './learnings/api'

export class Api extends HttpApi.make('mnemonic').add(LearningsApi).add(HealthApi) {}
