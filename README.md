# mnemonic

_What survives a run._

mnemonic is a self-hosted memory layer for agents.
It exposes durable memory via REST with scoped recall.

## Local references

- **Runtime API**: `src/index.ts`
- **Service logic**: `src/service.ts`
- **Schema source of truth**: `src/database/schema/`
- **DB migrations**: `src/database/migrations/`

---

## Core API surface

- Memory: `/learn`, `/inject`, `/inject/trace`, `/query`, `/learnings`, `/learning/:id`, `/learning/:id/neighbors`, `/stats`, `DELETE /learning/:id`, `DELETE /learnings`
- Secrets: `/secret`, `/secret/:name`, `/secrets`

Learnings include `last_recalled_at`, `recall_count` for tracking. Bulk delete: `DELETE /learnings?not_recalled_in_days=90` or `?scope=shared` (requires at least one filter).
