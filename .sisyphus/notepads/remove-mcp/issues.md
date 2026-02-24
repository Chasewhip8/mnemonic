
## [2026-02-24] Fix: out-of-scope changes

- `package.json` was accidentally reformatted (2-space → 4-space indent) and `"dev"` script renamed to `"human:dev"` with `--watch` flag added in commit cf9af30
- `data/audit-test.db` and `data/deja.db` were tracked in git (SQLite artifacts that should be gitignored)
- Fix: restored `package.json` to exact pre-commit state, added `data/*.db` to `.gitignore`, ran `git rm --cached` on both db files
- All 50 tests passed after fix
- New commit: 229c5de `fix: revert out-of-scope package.json changes and untrack db artifacts`
