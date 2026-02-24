# Drizzle migrations

This folder stores SQLite migration artifacts generated from `src/database/schema/`.

## Generate

```bash
bun run db:generate
```

## Apply

Migrations run automatically at service startup from `src/database/index.ts`.

- Default folder: `src/database/migrations`
- Override with: `DB_MIGRATIONS_DIR=/absolute/or/relative/path`
