import type {
	InjectResult,
	InjectTraceResult,
	Learning,
	QueryResult,
	Secret,
	Stats,
} from '../../mnemonic-client/src/index.ts'

const formatConfidence = (value: number): string => value.toFixed(2)

const formatSimilarity = (value: number): string => value.toFixed(4)

const shortId = (id: string): string => id.slice(0, 8)

const truncate = (value: string, maxLength: number): string => {
	if (value.length <= maxLength) {
		return value
	}
	if (maxLength <= 3) {
		return value.slice(0, maxLength)
	}
	return `${value.slice(0, maxLength - 3)}...`
}

export const formatLearning = (learning: Learning): string => {
	const lines = [
		`ID: ${shortId(learning.id)}`,
		`Trigger: ${learning.trigger}`,
		`Learning: ${learning.learning}`,
		`Confidence: ${formatConfidence(learning.confidence)}`,
		`Scope: ${learning.scope}`,
		`Recall count: ${learning.recallCount}`,
		`Created: ${learning.createdAt}`,
	]

	if (learning.lastRecalledAt !== undefined) {
		lines.push(`Last recalled: ${learning.lastRecalledAt}`)
	}

	return lines.join('\n')
}

export const formatLearningList = (learnings: readonly Learning[]): string => {
	if (learnings.length === 0) {
		return 'No learnings found.'
	}

	return learnings
		.map((learning, index) => {
			const trigger = truncate(learning.trigger, 40)
			const confidence = formatConfidence(learning.confidence)
			return `${index + 1}. ${shortId(learning.id)} | ${trigger} | ${confidence} | ${learning.scope}`
		})
		.join('\n')
}

export const formatInjectResult = (result: InjectResult): string => {
	const lines = ['Prompt:', result.prompt, '', `Matched learnings: ${result.learnings.length}`]

	if (result.learnings.length === 0) {
		lines.push('No matched learnings.')
		return lines.join('\n')
	}

	lines.push(
		...result.learnings.map(
			(learning, index) =>
				`${index + 1}. ${learning.trigger} (${formatConfidence(learning.confidence)})`,
		),
	)

	return lines.join('\n')
}

export const formatInjectTraceResult = (result: InjectTraceResult): string => {
	const lines = [
		'Context:',
		result.input_context,
		'',
		`Candidates: ${result.candidates.length} (threshold: ${formatConfidence(
			result.threshold_applied,
		)})`,
		`Above threshold: ${result.metadata.above_threshold}, Below: ${result.metadata.below_threshold}`,
		`Duration: ${result.duration_ms}ms`,
	]

	if (result.candidates.length > 0) {
		lines.push(
			...result.candidates.map((candidate, index) => {
				const status = candidate.passed_threshold ? 'passed' : 'failed'
				return `${index + 1}. [${status}] ${candidate.trigger} | ${formatSimilarity(
					candidate.similarity_score,
				)}`
			}),
		)
	} else {
		lines.push('No candidates evaluated.')
	}

	return lines.join('\n')
}

export const formatQueryResult = (result: QueryResult): string => {
	if (result.learnings.length === 0) {
		return 'No results found.'
	}

	return result.learnings
		.map((learning, index) => {
			const score = result.hits[learning.id] ?? 0
			return `${index + 1}. ${shortId(learning.id)} | ${learning.trigger} | hit: ${formatSimilarity(
				score,
			)}`
		})
		.join('\n')
}

export const formatStats = (stats: Stats): string => {
	const header = `Learnings: ${stats.totalLearnings} | Secrets: ${stats.totalSecrets}`
	if (stats.scopes.length === 0) {
		return `${header}\nScopes: none`
	}

	const scopeLines = stats.scopes.map((scope) => `- ${scope.scope}: ${scope.count}`)
	return `${header}\n${scopeLines.join('\n')}`
}

export const formatSecret = (secret: { value: string }): string => secret.value

export const formatSecretList = (secrets: readonly Secret[]): string => {
	if (secrets.length === 0) {
		return 'No secrets found.'
	}

	const nameWidth = Math.max('name'.length, ...secrets.map((secret) => secret.name.length))
	const header = `${'name'.padEnd(nameWidth)}  scope  updatedAt`
	const rows = secrets.map(
		(secret) => `${secret.name.padEnd(nameWidth)}  ${secret.scope}  ${secret.updatedAt}`,
	)

	return [header, ...rows].join('\n')
}

export const formatHealth = (health: { status: string; service: string }): string =>
	`${health.service}: ${health.status}`

export const formatCleanup = (result: { deleted: number; reasons: readonly string[] }): string => {
	const lines = [`Deleted ${result.deleted} learnings`]
	if (result.reasons.length > 0) {
		lines.push('Reasons:')
		lines.push(...result.reasons.map((reason, index) => `${index + 1}. ${reason}`))
	}
	return lines.join('\n')
}

export const formatDeleteResult = (result: { deleted: number; ids: readonly string[] }): string => {
	const lines = [`Deleted ${result.deleted} learning(s)`]
	if (result.ids.length > 0) {
		lines.push('IDs:')
		lines.push(...result.ids.map((id) => `- ${id}`))
	} else {
		lines.push('IDs: none')
	}
	return lines.join('\n')
}

export const formatNeighbors = (
	neighbors: ReadonlyArray<{
		id: string
		trigger: string
		similarity_score: number
		[k: string]: unknown
	}>,
): string => {
	if (neighbors.length === 0) {
		return 'No neighbors found.'
	}

	return neighbors
		.map(
			(neighbor, index) =>
				`${index + 1}. ${shortId(neighbor.id)} | ${formatSimilarity(neighbor.similarity_score)} | ${neighbor.trigger}`,
		)
		.join('\n')
}
