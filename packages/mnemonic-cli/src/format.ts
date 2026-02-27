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

class XmlRaw {
	constructor(readonly value: string) {}
}

/** Wrap pre-built XML to prevent double-escaping in xml`` */
export const raw = (value: string): XmlRaw => new XmlRaw(value)

/** Tagged template — auto-escapes all interpolated values unless wrapped in raw() */
export const xml = (strings: TemplateStringsArray, ...values: unknown[]): string =>
	strings.reduce((out, str, i) => {
		if (i >= values.length) return out + str
		const val = values[i]
		return out + str + (val instanceof XmlRaw ? val.value : escapeXml(String(val)))
	}, '')

const formatMemory = (learning: Learning): string =>
	xml`<memory id="${learning.id}" scope="${learning.scope}">
  <trigger>${learning.trigger}</trigger>
  <content>${learning.learning}</content>
</memory>`

export const formatLearning = (learning: Learning): string => {
	const lastRecalled =
		learning.lastRecalledAt !== undefined ? xml` last_recalled="${learning.lastRecalledAt}"` : ''

	const children = [
		xml`  <trigger>${learning.trigger}</trigger>`,
		xml`  <content>${learning.learning}</content>`,
	]
	if (learning.reason !== undefined) {
		children.push(xml`  <reason>${learning.reason}</reason>`)
	}
	if (learning.source !== undefined) {
		children.push(xml`  <source>${learning.source}</source>`)
	}

	return xml`<learning id="${learning.id}" scope="${learning.scope}" recall_count="${learning.recallCount}" created="${learning.createdAt}"${raw(lastRecalled)}>
${raw(children.join('\n'))}
</learning>`
}

export const formatLearnResult = (learning: Learning): string =>
	xml`<learning id="${learning.id}" scope="${learning.scope}" />`

export const formatLearningList = (learnings: readonly Learning[]): string => {
	if (learnings.length === 0) return '<learnings count="0" />'
	const items = learnings.map(formatLearning).join('\n')
	return `<learnings count="${learnings.length}">\n${items}\n</learnings>`
}

export const formatInjectResult = (result: InjectResult): string => {
	if (result.learnings.length === 0) return '<recalled_memories />'
	const memories = result.learnings.map(formatMemory).join('\n')
	return `<recalled_memories>\n${memories}\n</recalled_memories>`
}

export const formatInjectTraceResult = (result: InjectTraceResult): string => {
	const candidates = result.candidates
		.map(
			(c) =>
				xml`<candidate id="${c.id}" similarity="${c.similarity_score}" passed="${c.passed_threshold}">
  <trigger>${c.trigger}</trigger>
</candidate>`,
		)
		.join('\n')

	const injected = result.injected.map(formatMemory).join('\n')

	const candidateBlock = candidates.length > 0 ? `\n${candidates}\n` : ''
	const injectedBlock = injected.length > 0 ? `\n${injected}\n` : ''

	const meta = result.metadata
	return [
		xml`<inject_trace context="${result.input_context}" threshold="${result.threshold_applied}" duration_ms="${result.duration_ms}">`,
		`<candidates total="${meta.total_candidates}" above_threshold="${meta.above_threshold}" below_threshold="${meta.below_threshold}">${candidateBlock}</candidates>`,
		`<injected count="${result.injected.length}">${injectedBlock}</injected>`,
		'</inject_trace>',
	].join('\n')
}

export const formatQueryResult = (result: QueryResult): string => {
	if (result.learnings.length === 0) return '<query_results count="0" />'

	const rows = result.learnings
		.map((learning) => {
			const similarity = result.similarities[learning.id] ?? 0
			return xml`<result id="${learning.id}" similarity="${similarity}" scope="${learning.scope}">
  <trigger>${learning.trigger}</trigger>
  <content>${learning.learning}</content>
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
	if (neighbors.length === 0) return '<neighbors count="0" />'

	const rows = neighbors
		.map(
			(n) =>
				xml`<neighbor id="${n.id}" similarity="${n.similarity_score}">
  <trigger>${n.trigger}</trigger>
</neighbor>`,
		)
		.join('\n')

	return `<neighbors count="${neighbors.length}">\n${rows}\n</neighbors>`
}

export const formatStats = (stats: Stats): string => {
	if (stats.scopes.length === 0) return `<stats learnings="${stats.totalLearnings}" />`

	const scopes = stats.scopes
		.map((s) => xml`<scope name="${s.scope}" count="${s.count}" />`)
		.join('\n')

	return `<stats learnings="${stats.totalLearnings}">\n${scopes}\n</stats>`
}


export const formatDeleteSuccess = (id: string): string =>
	xml`<result action="forget" id="${id}" />`

export const formatDeleteResult = (result: { deleted: number; ids: readonly string[] }): string => {
	if (result.ids.length === 0) return `<result action="prune" deleted="${result.deleted}" />`

	const ids = result.ids.map((id) => xml`<id>${id}</id>`).join('\n')
	return `<result action="prune" deleted="${result.deleted}">\n${ids}\n</result>`
}

export const formatCleanup = (result: { deleted: number; reasons: readonly string[] }): string => {
	if (result.reasons.length === 0) return `<result action="cleanup" deleted="${result.deleted}" />`

	const reasons = result.reasons.map((r) => xml`<reason>${r}</reason>`).join('\n')
	return `<result action="cleanup" deleted="${result.deleted}">\n${reasons}\n</result>`
}

export const formatHealth = (health: { status: string; service: string }): string =>
	xml`<health service="${health.service}" status="${health.status}" />`
