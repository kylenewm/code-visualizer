# Project: CodeFlow Viz

## Overview
A real-time code flow visualization tool that shows:
1. **Build-time tracking** - Watch files being created/modified as Claude builds
2. **Static flow analysis** - Visualize function calls, data flow between modules
3. **Rendered at cadence** - Periodic snapshots of code structure, not continuous

## Invariants (ALWAYS FOLLOW)

### Architecture
- Always use file system watchers (chokidar) for build-time tracking - never poll for changes
- Always parse code with tree-sitter for language-agnostic AST analysis - never use regex for code parsing
- Always render flow graphs using D3.js or similar - never use canvas for interactive graphs
- Never block the main thread during AST parsing - always use worker threads for heavy analysis

### Data Flow
- Always store flow snapshots in SQLite for persistence - never keep only in memory
- Always debounce file change events (500ms minimum) - never trigger analysis on every keystroke
- Always cache parsed ASTs until file changes - never re-parse unchanged files
- Never send source code to external services - all analysis must be local

### Visualization
- Always use directed graphs for call flow - never use tree layouts for circular dependencies
- Always show file:line references on hover - never hide source locations
- Always support zoom/pan for large codebases - never render fixed-size graphs
- Never auto-layout while user is interacting - always pause layout on mouse down

### Performance
- Always limit graph nodes to 500 visible at once - never render entire codebase at once
- Always use virtual scrolling for file lists - never render all files in DOM
- Always compress snapshots older than 1 hour - never keep full history uncompressed
- Never analyze node_modules or .git directories - always exclude by default

### Integration
- Always support Claude Code hooks for build tracking - never require manual instrumentation
- Always export flow data as JSON - never use proprietary formats
- Always provide CLI interface alongside web UI - never require browser for basic info

## Stack
- **Backend**: Node.js with Express
- **Frontend**: React with D3.js for visualization
- **Parser**: tree-sitter (multi-language support)
- **Database**: SQLite for snapshots
- **File Watching**: chokidar
- **Build Tracking**: Claude Code hooks integration

## Testing
```bash
npm test
npm run test:watch
```

## Slash Commands
| Command | What |
|---------|------|
| /test | Run tests |
| /test-cycle | Generate + run progressively |
| /done | Verify before complete |
| /review | Subagent review |
| /ship | verify → commit → PR |
| /save | Update STATE.md + LOG.md |
| /summarize | Explain changes |
| /commit | Commit with message |

**Flow:** `work → /test → /done → /review → /ship`

## Key Files (planned)
- `src/watcher/index.ts` - File system watcher
- `src/parser/index.ts` - AST parsing with tree-sitter
- `src/analyzer/flow.ts` - Call graph and data flow analysis
- `src/storage/snapshots.ts` - SQLite snapshot storage
- `src/server/index.ts` - Express API server
- `src/web/App.tsx` - React visualization UI
- `src/web/components/FlowGraph.tsx` - D3 graph component
- `src/cli/index.ts` - CLI interface
- `lib/db.ts` - Database setup

## Context
- STATE.md: Current work and progress
- LOG.md: History (append-only)
