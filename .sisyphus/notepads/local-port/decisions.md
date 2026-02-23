# Decisions

## Architecture
- Single Hono server replacing CF Worker + DO double-dispatch
- DejaService plain class (no DurableObject base) takes db client + drizzle as constructor params
- libSQL file DB at ./data/deja.db (DB_PATH env var)
- @huggingface/transformers with onnx-community/bge-small-en-v1.5-ONNX for local embeddings
- node-cron for scheduled cleanup at midnight UTC daily
- Single-tenant (one DB, one API key)

## Scope
- Replace in-place — CF code lives in git history
- No marketing site changes, no packages/deja-client changes
- No Docker, PM2, dotenv, or deployment tooling
