import { sql } from 'drizzle-orm'
import type { DrizzleRawDb, LearningRow } from '../types'

function toLearningRow(row: unknown): LearningRow {
	if (!Array.isArray(row)) {
		return row as LearningRow
	}

	return {
		id: row[0] as string,
		trigger: row[1] as string,
		learning: row[2] as string,
		reason: row[3] as string | null,
		source: row[4] as string | null,
		scope: row[5] as string,
		created_at: row[7] as string,
		last_recalled_at: row[8] as string | null,
		recall_count: row[9] as number | null,
		...(row[10] !== undefined ? { distance: row[10] as number } : {}),
	}
}

export function insertLearningRaw(
	db: DrizzleRawDb,
	params: {
		id: string
		trigger: string
		learning: string
		reason: string | null
		source: string | null
		scope: string
		embeddingJson: string
		createdAt: string
	},
): Promise<void> {
	return Promise.resolve(
		db.run(sql`INSERT INTO learnings (id, trigger, learning, reason, source, scope, embedding, created_at, recall_count)
			VALUES (${params.id}, ${params.trigger}, ${params.learning}, ${params.reason}, ${params.source}, ${params.scope}, vector32(${params.embeddingJson}), ${params.createdAt}, 0)`),
	).then(() => undefined)
}

export function queryLearningsByEmbeddingRaw(
	db: DrizzleRawDb,
	embeddingJson: string,
	scopes: ReadonlyArray<string>,
	limit: number,
): Promise<Array<LearningRow>> {
	const scopeValues = scopes.map((scope) => sql`${scope}`)
	return Promise.resolve(
		db.all<unknown>(sql`SELECT *, vector_distance_cos(embedding, vector32(${embeddingJson})) as distance
			FROM learnings
			WHERE scope IN (${sql.join(scopeValues, sql`, `)})
			ORDER BY distance ASC
			LIMIT ${limit}`),
	).then((rows) => rows.map(toLearningRow))
}

export function queryLearningNeighborsRaw(
	db: DrizzleRawDb,
	id: string,
	limit: number,
): Promise<Array<LearningRow>> {
	return Promise.resolve(
		db.all<unknown>(sql`SELECT l2.*, vector_distance_cos(l2.embedding, l1.embedding) as distance
			FROM learnings l1 JOIN learnings l2 ON l1.id = ${id} AND l2.id != ${id}
			ORDER BY distance ASC
			LIMIT ${limit}`),
	).then((rows) => rows.map(toLearningRow))
}
