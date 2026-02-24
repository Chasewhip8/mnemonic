
## [2026-02-24] Task: 1

- `bun run check` script doesn't exist; typecheck is `bun run typecheck`
- tsc output only warnings/messages (Effect language service hints), no errors — exit 0
- `bun test` runs vitest, 50 tests across 6 files all pass after MCP removal
- Removing `.add(McpApi) {}` required merging `{}` onto the previous `.add(HealthApi)` line
- Blank line left in import block after removing `parseMcpToolResult,` line needed explicit deletion
- README had double blank line after removing MCP section + `---` separator; needed one extra deletion
- `grep -ri "mcp" src/` returns exit 1 (no matches) = clean
