import { Schema } from 'effect'

export class Learning extends Schema.Class<Learning>('Learning')({
	id: Schema.String,
	trigger: Schema.String,
	learning: Schema.String,
	reason: Schema.optional(Schema.String),
	confidence: Schema.Number,
	source: Schema.optional(Schema.String),
	scope: Schema.String,
	createdAt: Schema.String,
	lastRecalledAt: Schema.optional(Schema.String),
	recallCount: Schema.Number,
}) {}

export class Secret extends Schema.Class<Secret>('Secret')({
	name: Schema.String,
	value: Schema.String,
	scope: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
}) {}

export class InjectResult extends Schema.Class<InjectResult>('InjectResult')({
	learnings: Schema.Array(Learning),
}) {}

const InjectTraceCandidate = Schema.Struct({
	id: Schema.String,
	trigger: Schema.String,
	learning: Schema.String,
	similarity_score: Schema.Number,
	passed_threshold: Schema.Boolean,
})

const InjectTraceMetadata = Schema.Struct({
	total_candidates: Schema.Number,
	above_threshold: Schema.Number,
	below_threshold: Schema.Number,
})

export class InjectTraceResult extends Schema.Class<InjectTraceResult>('InjectTraceResult')({
	input_context: Schema.String,
	embedding_generated: Schema.Array(Schema.Number),
	candidates: Schema.Array(InjectTraceCandidate),
	threshold_applied: Schema.Number,
	injected: Schema.Array(Learning),
	duration_ms: Schema.Number,
	metadata: InjectTraceMetadata,
}) {}

export class QueryResult extends Schema.Class<QueryResult>('QueryResult')({
	learnings: Schema.Array(Learning),
	hits: Schema.Record({ key: Schema.String, value: Schema.Number }),
}) {}

const ScopeStats = Schema.Struct({
	scope: Schema.String,
	count: Schema.Number,
})

export class Stats extends Schema.Class<Stats>('Stats')({
	totalLearnings: Schema.Number,
	totalSecrets: Schema.Number,
	scopes: Schema.Array(ScopeStats),
}) {}
