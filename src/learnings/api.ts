import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { InjectResult, InjectTraceResult, Learning, QueryResult, Stats } from '../domain'
import { DatabaseError, EmbeddingError, NotFoundError, ValidationError } from '../errors'
import { Authorization } from '../security'

const LearnBody = Schema.Struct({
	trigger: Schema.String,
	learning: Schema.String,
	scope: Schema.optional(Schema.String),
	reason: Schema.optional(Schema.String),
	source: Schema.optional(Schema.String),
})

const InjectBody = Schema.Struct({
	context: Schema.String,
	scopes: Schema.optional(Schema.Array(Schema.String)),
	limit: Schema.optional(Schema.Number),
	threshold: Schema.optional(Schema.Number),
})

const InjectTraceBody = Schema.Struct({
	context: Schema.String,
	scopes: Schema.optional(Schema.Array(Schema.String)),
	limit: Schema.optional(Schema.Number),
	threshold: Schema.optional(Schema.Number),
})

const QueryBody = Schema.Struct({
	text: Schema.String,
	scopes: Schema.optional(Schema.Array(Schema.String)),
	limit: Schema.optional(Schema.Number),
})

const DeleteLearningsResponse = Schema.Struct({
	deleted: Schema.Number,
	ids: Schema.Array(Schema.String),
})

const DeleteLearningResponse = Schema.Struct({
	success: Schema.Literal(true),
})

const LearningWithSimilarity = Schema.Struct({
	...Learning.fields,
	similarity_score: Schema.Number,
})

export class LearningsApi extends HttpApiGroup.make('learnings')
	.add(
		HttpApiEndpoint.post('learn', '/learn')
			.setPayload(LearnBody)
			.addSuccess(Learning)
			.addError(DatabaseError)
			.addError(EmbeddingError)
			.addError(ValidationError),
	)
	.add(
		HttpApiEndpoint.post('inject', '/inject')
			.setPayload(InjectBody)
			.addSuccess(InjectResult)
			.addError(DatabaseError)
			.addError(EmbeddingError),
	)
	.add(
		HttpApiEndpoint.post('injectTrace', '/inject/trace')
			.setPayload(InjectTraceBody)
			.setUrlParams(
				Schema.Struct({
					threshold: Schema.optional(Schema.String),
				}),
			)
			.addSuccess(InjectTraceResult)
			.addError(DatabaseError)
			.addError(EmbeddingError),
	)
	.add(
		HttpApiEndpoint.post('query', '/query')
			.setPayload(QueryBody)
			.addSuccess(QueryResult)
			.addError(DatabaseError)
			.addError(EmbeddingError),
	)
	.add(
		HttpApiEndpoint.get('getLearnings', '/learnings')
			.setUrlParams(
				Schema.Struct({
					scope: Schema.optional(Schema.String),
					limit: Schema.optional(Schema.NumberFromString),
				}),
			)
			.addSuccess(Schema.Array(Learning))
			.addError(DatabaseError),
	)
	.add(
		HttpApiEndpoint.del('deleteLearnings', '/learnings')
			.setUrlParams(
				Schema.Struct({
					not_recalled_in_days: Schema.optional(Schema.NumberFromString),
					scope: Schema.optional(Schema.String),
				}),
			)
			.addSuccess(DeleteLearningsResponse)
			.addError(ValidationError)
			.addError(DatabaseError),
	)
	.add(
		HttpApiEndpoint.del('deleteLearning', '/learning/:id')
			.setPath(Schema.Struct({ id: Schema.String }))
			.addSuccess(DeleteLearningResponse)
			.addError(NotFoundError)
			.addError(DatabaseError),
	)
	.add(
		HttpApiEndpoint.get('getLearningNeighbors', '/learning/:id/neighbors')
			.setPath(Schema.Struct({ id: Schema.String }))
			.setUrlParams(
				Schema.Struct({
					threshold: Schema.optional(Schema.NumberFromString),
					limit: Schema.optional(Schema.NumberFromString),
				}),
			)
			.addSuccess(Schema.Array(LearningWithSimilarity))
			.addError(NotFoundError)
			.addError(DatabaseError)
			.addError(EmbeddingError),
	)
	.add(HttpApiEndpoint.get('getStats', '/stats').addSuccess(Stats).addError(DatabaseError))
	.middleware(Authorization) {}
