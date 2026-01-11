# STATE.md

## Current Work
- [ ] Set up project structure with TypeScript, React, Express
- [ ] Implement file watcher with chokidar
- [ ] Set up tree-sitter for multi-language parsing
- [ ] Create SQLite schema for flow snapshots

## Blockers
None.

## Recent Decisions
| Decision | Why |
|----------|-----|
| tree-sitter over language-specific parsers | Single API for JS, TS, Python, Go, etc. |
| SQLite over filesystem | Query snapshots, compress old data, atomic writes |
| D3.js over canvas | Interactive graphs, easier hover/click handling |
| Static rendering at cadence | Real-time is too noisy, periodic snapshots are cleaner |
| Local-only analysis | Privacy, no network dependency, works offline |
