import type {
	InjectResult,
	InjectTraceResult,
	Learning,
	QueryResult,
	Stats,
} from '../../mnemonic-client/src/index.ts'

export const escapeXml = (str: string): string =>
	str
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')

export const formatLearning = (learning: Learning): string => {
	const attrs = [
		`id="${learning.id}"`,
		`scope="${escapeXml(learning.scope)}"`,
		`recall_count="${learning.recallCount}"`,
		`created="${learning.createdAt}"`,
	]

	if (learning.lastRecalledAt !== undefined) {
		attrs.push(`last_recalled="${learning.lastRecalledAt}"`)
	}

	const lines = [
		`<learning ${attrs.join(' ')}>`,
		`  <trigger>${escapeXml(learning.trigger)}</trigger>`,
		`  <content>${escapeXml(learning.learning)}</content>`,
	]

	if (learning.reason !== undefined) {
		lines.push(`  <reason>${escapeXml(learning.reason)}</reason>`)
	}

	if (learning.source !== undefined) {
		lines.push(`  <source>${escapeXml(learning.source)}</source>`)
	}

	lines.push('</learning>')

	return lines.join('\n')
}

export const formatLearningList = (learnings: readonly Learning[]): string => {
	if (learnings.length === 0) {
		return '<learnings count="0" />'
	}

	const items = learnings.map((learning) => formatLearning(learning)).join('\n')
	return `<learnings count="${learnings.length}">\n${items}\n</learnings>`
}

export const formatInjectResult = (result: InjectResult): string => {
	if (result.learnings.length === 0) {
		return '<recalled_memories count="0" />'
	}

	const memories = result.learnings
		.map(
			(learning) =>
				`<memory id="${learning.id}" scope="${escapeXml(learning.scope)}">
  <trigger>${escapeXml(learning.trigger)}</trigger>
  <content>${escapeXml(learning.learning)}</content>
</memory>`,
		)
		.join('\n')

	return `<recalled_memories count="${result.learnings.length}">\n${memories}\n</recalled_memories>`
}

export const formatInjectTraceResult = (result: InjectTraceResult): string => {
	const candidates = result.candidates
		.map(
			(candidate) =>
				`<candidate id="${candidate.id}" similarity="${candidate.similarity_score}" passed="${candidate.passed_threshold}">\n  <trigger>${escapeXml(candidate.trigger)}</trigger>\n</candidate>`,
		)
		.join('\n')

	const injected = result.injected
		.map(
			(learning) =>
				`<memory id="${learning.id}" scope="${escapeXml(learning.scope)}">
  <trigger>${escapeXml(learning.trigger)}</trigger>
  <content>${escapeXml(learning.learning)}</content>
</memory>`,
		)
		.join('\n')

	const candidateBlock = candidates.length > 0 ? `\n${candidates}\n` : ''
	const injectedBlock = injected.length > 0 ? `\n${injected}\n` : ''

	return [
		`<inject_trace context="${escapeXml(result.input_context)}" threshold="${result.threshold_applied}" duration_ms="${result.duration_ms}">`,
		`<candidates total="${result.metadata.total_candidates}" above_threshold="${result.metadata.above_threshold}" below_threshold="${result.metadata.below_threshold}">${candidateBlock}</candidates>`,
		`<injected count="${result.injected.length}">${injectedBlock}</injected>`,
		'</inject_trace>',
	].join('\n')
}

export const formatQueryResult = (result: QueryResult): string => {
	if (result.learnings.length === 0) {
		return '<query_results count="0" />'
	}

	const rows = result.learnings
		.map((learning) => {
			const similarity = result.similarities[learning.id] ?? 0
			return `<result id="${learning.id}" similarity="${similarity}" scope="${escapeXml(learning.scope)}">
  <trigger>${escapeXml(learning.trigger)}</trigger>
  <content>${escapeXml(learning.learning)}</content>
</result>`
		})
		.join('\n')

	return `<query_results count="${result.learnings.length}">\n${rows}\n</query_results>`
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
		return '<neighbors count="0" />'
	}

	const rows = neighbors
		.map(
			(neighbor) =>
				`<neighbor id="${neighbor.id}" similarity="${neighbor.similarity_score}">\n  <trigger>${escapeXml(neighbor.trigger)}</trigger>\n</neighbor>`,
		)
		.join('\n')

	return `<neighbors count="${neighbors.length}">\n${rows}\n</neighbors>`
}

export const formatStats = (stats: Stats): string => {
	if (stats.scopes.length === 0) {
		return `<stats learnings="${stats.totalLearnings}" />`
	}

	const scopes = stats.scopes
		.map((scope) => `<scope name="${escapeXml(scope.scope)}" count="${scope.count}" />`)
		.join('\n')

	return `<stats learnings="${stats.totalLearnings}">\n${scopes}\n</stats>`
}

export const formatDeleteSuccess = (id: string): string => `<result action="forget" id="${id}" />`

export const formatDeleteResult = (result: { deleted: number; ids: readonly string[] }): string => {
	if (result.ids.length === 0) {
		return `<result action="prune" deleted="${result.deleted}" />`
	}

	const ids = result.ids.map((id) => `<id>${id}</id>`).join('\n')
	return `<result action="prune" deleted="${result.deleted}">\n${ids}\n</result>`
}

export const formatCleanup = (result: { deleted: number; reasons: readonly string[] }): string => {
	if (result.reasons.length === 0) {
		return `<result action="cleanup" deleted="${result.deleted}" />`
	}

	const reasons = result.reasons.map((reason) => `<reason>${escapeXml(reason)}</reason>`).join('\n')
	return `<result action="cleanup" deleted="${result.deleted}">\n${reasons}\n</result>`
}

export const formatHealth = (health: { status: string; service: string }): string =>
	`<health service="${escapeXml(health.service)}" status="${escapeXml(health.status)}" />`
