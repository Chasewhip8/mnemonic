import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { WorkingStatePayload, WorkingStateResponse } from '../domain'
import { DatabaseError, NotFoundError, ValidationError } from '../errors'
import { Authorization } from '../security'

const UpsertStateBody = Schema.Struct({
	...WorkingStatePayload.fields,
	updatedBy: Schema.optional(Schema.String),
	changeSummary: Schema.optional(Schema.String),
})

const PatchStateBody = Schema.Struct({
	...WorkingStatePayload.fields,
	updatedBy: Schema.optional(Schema.String),
})

const AddEventBody = Schema.Struct({
	eventType: Schema.optional(Schema.String),
	payload: Schema.optional(Schema.Unknown),
	createdBy: Schema.optional(Schema.String),
})

const AddEventResponse = Schema.Struct({
	success: Schema.Boolean,
	id: Schema.String,
})

const ResolveBody = Schema.Struct({
	persistToLearn: Schema.optional(Schema.Boolean),
	scope: Schema.optional(Schema.String),
	summaryStyle: Schema.optional(Schema.String),
	updatedBy: Schema.optional(Schema.String),
})

export class StateApi extends HttpApiGroup.make('state')
	.add(
		HttpApiEndpoint.get('getState', '/state/:runId')
			.setPath(Schema.Struct({ runId: Schema.String }))
			.addSuccess(WorkingStateResponse)
			.addError(NotFoundError)
			.addError(DatabaseError),
	)
	.add(
		HttpApiEndpoint.put('upsertState', '/state/:runId')
			.setPath(Schema.Struct({ runId: Schema.String }))
			.setPayload(UpsertStateBody)
			.addSuccess(WorkingStateResponse)
			.addError(NotFoundError)
			.addError(DatabaseError)
			.addError(ValidationError),
	)
	.add(
		HttpApiEndpoint.patch('patchState', '/state/:runId')
			.setPath(Schema.Struct({ runId: Schema.String }))
			.setPayload(PatchStateBody)
			.addSuccess(WorkingStateResponse)
			.addError(NotFoundError)
			.addError(DatabaseError)
			.addError(ValidationError),
	)
	.add(
		HttpApiEndpoint.post('addStateEvent', '/state/:runId/events')
			.setPath(Schema.Struct({ runId: Schema.String }))
			.setPayload(AddEventBody)
			.addSuccess(AddEventResponse)
			.addError(NotFoundError)
			.addError(DatabaseError),
	)
	.add(
		HttpApiEndpoint.post('resolveState', '/state/:runId/resolve')
			.setPath(Schema.Struct({ runId: Schema.String }))
			.setPayload(ResolveBody)
			.addSuccess(WorkingStateResponse)
			.addError(NotFoundError)
			.addError(DatabaseError),
	)
	.middleware(Authorization) {}
