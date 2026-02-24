import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const secrets = sqliteTable(
	'secrets',
	{
		name: text('name').primaryKey(),
		value: text('value').notNull(),
		scope: text('scope').notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	(table) => [index('idx_secrets_scope').on(table.scope)],
)
