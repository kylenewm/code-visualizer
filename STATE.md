# STATE.md

## Current Work
- [ ] Investigate Claude Code's hook mechanisms (MCP, CLI, files)
- [ ] Build minimal `ClaudeHookAdapter` prototype
- [ ] Test correlation: hook event → file changes

## Blockers
None.

## Recent Decisions
| Decision | Why |
|----------|-----|
| tree-sitter for Phase A analysis | Fast (10-50ms per file), incremental parsing, multi-language without separate backends |
| TypeScript Language Service for Phase B | Incremental compilation, handles `tsconfig.json` paths, project references |
| Dagre over force-directed layout | Deterministic layout = stable positions across snapshots; no jitter |
| SQLite over JSON files | Query by time, by file, by transaction; proper indexes; atomic writes |
| Default prompt retention: "never" | Privacy-first approach; code stays local by default |