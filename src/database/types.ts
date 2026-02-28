import type { SQLWrapper } from 'drizzle-orm'

export type LearningRow = {
	id: string
	trigger: string
	learning: string
	reason: string | null
	source: string | null
	scope: string
	created_at: string
	last_recalled_at: string | null
	recall_count: number | null
	deleted_at: string | null
	distance?: number // only present in vector distance queries
}

export type DrizzleRawDb = {
	run: (query: string | SQLWrapper) => PromiseLike<unknown>
	all: <T = unknown>(query: string | SQLWrapper) => PromiseLike<Array<T>>
}
