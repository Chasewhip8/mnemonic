import { DrizzleQueryError } from 'drizzle-orm/errors'
import { Schema } from 'effect'

export class DatabaseConstraintError extends Schema.TaggedError<DatabaseConstraintError>()(
	'DatabaseConstraintError',
	{ cause: Schema.Unknown },
) {}

export class DatabaseDataInputError extends Schema.TaggedError<DatabaseDataInputError>()(
	'DatabaseDataInputError',
	{ cause: Schema.Unknown },
) {}

export class DatabaseAvailabilityError extends Schema.TaggedError<DatabaseAvailabilityError>()(
	'DatabaseAvailabilityError',
	{ cause: Schema.Unknown },
) {}

export class RetryableDatabaseError extends Schema.TaggedError<RetryableDatabaseError>()(
	'RetryableDatabaseError',
	{ cause: Schema.Unknown },
) {}

export class DatabaseMigrationError extends Schema.TaggedError<DatabaseMigrationError>()(
	'DatabaseMigrationError',
	{ cause: Schema.Unknown },
) {}

const CONSTRAINT_CODES = new Set([
	'SQLITE_CONSTRAINT',
	'SQLITE_CONSTRAINT_UNIQUE',
	'SQLITE_CONSTRAINT_PRIMARYKEY',
	'SQLITE_CONSTRAINT_FOREIGNKEY',
	'SQLITE_CONSTRAINT_NOTNULL',
	'SQLITE_CONSTRAINT_CHECK',
])

const INPUT_CODES = new Set(['SQLITE_MISMATCH', 'SQLITE_RANGE', 'SQLITE_TOOBIG', 'SQLITE_ERROR'])

const RETRYABLE_CODES = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED'])

const AVAILABILITY_CODES = new Set([
	'SQLITE_CANTOPEN',
	'SQLITE_IOERR',
	'SQLITE_PROTOCOL',
	'SQLITE_NOMEM',
	'SQLITE_FULL',
	'SQLITE_READONLY',
])

function getInnerCause(error: unknown): unknown {
	if (error instanceof DrizzleQueryError) {
		return error.cause
	}
	return error
}

function getSqliteCode(error: unknown): string | null {
	const cause = getInnerCause(error)
	const code = (typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string') ? cause.code.toUpperCase() : null
	return code
}

export function classifySqliteError(error: unknown) {
	const code = getSqliteCode(error)
	if (code === null) {
		return DatabaseAvailabilityError.make({ cause: error })
	}

	if (CONSTRAINT_CODES.has(code)) {
		return DatabaseConstraintError.make({ cause: error })
	}

	if (INPUT_CODES.has(code)) {
		return DatabaseDataInputError.make({ cause: error })
	}

	if (RETRYABLE_CODES.has(code)) {
		return RetryableDatabaseError.make({ cause: error })
	}

	if (AVAILABILITY_CODES.has(code)) {
		return DatabaseAvailabilityError.make({ cause: error })
	}

	return DatabaseAvailabilityError.make({ cause: error })
}
