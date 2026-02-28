import { Command, ValidationError } from '@effect/cli'
// Import directly from subpaths to avoid @effect/cluster peer dep mismatch in platform-bun index
import { layer as BunContextLayer } from '@effect/platform-bun/BunContext'
import { runMain } from '@effect/platform-bun/BunRuntime'
import { Effect } from 'effect'
import { cleanup } from './commands/cleanup.ts'
import { forget } from './commands/forget.ts'
import { health } from './commands/health.ts'
import { installSkill } from './commands/install-skill.ts'
import { learn } from './commands/learn.ts'
import { list } from './commands/list.ts'
import { neighbors } from './commands/neighbors.ts'
import { prune } from './commands/prune.ts'
import { query } from './commands/query.ts'
import { recall } from './commands/recall.ts'
import { rescope } from './commands/rescope.ts'
import { mn } from './commands/root.ts'
import { stats } from './commands/stats.ts'

const app = mn.pipe(
	Command.withSubcommands([
		learn,
		recall,
		query,
		list,
		forget,
		rescope,
		prune,
		neighbors,
		stats,
		health,
		cleanup,
		installSkill,
	]),
)

const cli = Command.run(app, { name: 'mn', version: '0.1.0' })

cli(process.argv).pipe(
	Effect.catchIf(
		ValidationError.isValidationError,
		() => Effect.sync(() => process.exit(1)),
	),
	Effect.provide(BunContextLayer),
	runMain,
)
