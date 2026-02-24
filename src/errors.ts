import { HttpApiSchema } from '@effect/platform';
import { Schema } from 'effect';

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
	'DatabaseError',
	{
		cause: Schema.Defect,
	}
) {}

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()(
	'EmbeddingError',
	{
		cause: Schema.Defect,
	}
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
	'NotFoundError',
	{
		message: Schema.String,
	},
	HttpApiSchema.annotations({ status: 404 })
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	'Unauthorized',
	{},
	HttpApiSchema.annotations({ status: 401 })
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
	'ValidationError',
	{
		message: Schema.String,
	},
	HttpApiSchema.annotations({ status: 400 })
) {}
