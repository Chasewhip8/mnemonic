import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { f32Blob } from './customTypes'

export const learnings = sqliteTable(
	'learnings',
	{
		id: text('id').primaryKey(),
		trigger: text('trigger').notNull(),
		learning: text('learning').notNull(),
		reason: text('reason'),
		confidence: real('confidence').default(1.0),
		source: text('source'),
		scope: text('scope').notNull(),
		embedding: f32Blob('embedding'),
		createdAt: text('created_at').notNull(),
		lastRecalledAt: text('last_recalled_at'),
		recallCount: integer('recall_count').default(0),
	},
	(table) => [
		index('idx_learnings_trigger').on(table.trigger),
		index('idx_learnings_confidence').on(table.confidence),
		index('idx_learnings_created_at').on(table.createdAt),
		index('idx_learnings_scope').on(table.scope),
		index('idx_learnings_last_recalled_at').on(table.lastRecalledAt),
	],
)
