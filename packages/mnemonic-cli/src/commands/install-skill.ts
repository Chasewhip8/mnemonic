import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Command } from '@effect/cli'
import { Console, Effect } from 'effect'
import bootstrapSkill from '../../../../.opencode/skills/mnemonic-bootstrap/SKILL.md' with {
	type: 'text',
}

const SKILLS_DIR = join(homedir(), '.agents', 'skills')

const skills: Record<string, string> = {
	'mnemonic-bootstrap': bootstrapSkill,
}

export const installSkill = Command.make('install-skill', {}, () =>
	Effect.gen(function* () {
		for (const [name, content] of Object.entries(skills)) {
			const dir = join(SKILLS_DIR, name)
			yield* Effect.promise(() => mkdir(dir, { recursive: true }))
			yield* Effect.promise(() => writeFile(join(dir, 'SKILL.md'), content))
			yield* Console.log(`Installed ${name} → ${dir}/SKILL.md`)
		}
	}),
).pipe(Command.withDescription('Install mnemonic agent skills to ~/.agents/skills/'))
