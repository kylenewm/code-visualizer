# Project: CodeFlow Visualizer

## Overview
A developer tool that provides real-time transparency into AI-assisted coding by tracking file changes, performing multi-tier static analysis, and rendering interactive flow graphs—making the "black box" of LLM code generation observable and reviewable.

## Invariants (ALWAYS FOLLOW)

### Claude Integration
- Always check for Claude hooks availability before falling back to filesystem-only mode
- Never store full prompt content in database unless explicitly configured with `promptRetention: 'full'`
- Always redact sensitive information from hook metadata before persistence
- Transaction source must be explicitly tagged as 'claude_hook' or 'fs_debounce' - never mixed or ambiguous

### Transaction Management
- Never commit a transaction without a valid timestamp and unique UUID
- Always debounce filesystem events to 500ms minimum before creating fallback transactions
- Transaction status must progress linearly: 'open' → 'committed' OR 'open' → 'cancelled' - never backwards
- Never allow overlapping open transactions for the same file paths

### Graph Node Identity
- Node IDs must always use the format `${fileId}:${kind}:${name}:${hash}` for stability across snapshots
- Never create nodes without stable identity - all nodes must survive file renames and moves
- Always use content hash + size tuple for rename detection, never rely on filesystem move events alone
- Graph edges must reference node IDs, never file paths directly

### Analysis Pipeline
- Phase A (tree-sitter) analysis must complete in <100ms per file - cancel if exceeded
- Never run Phase B semantic analysis without successful Phase A completion
- Always tag edge confidence as 'exact', 'typechecked', or 'heuristic' - never leave unspecified
- New analysis must cancel in-flight analysis for the same transaction - never queue multiple analyses

### Semantic Annotations
- Annotations must always include contentHash from time of generation - never store annotation without hash
- Annotation text must be 1-3 sentences max - never generate verbose multi-paragraph annotations
- Never auto-regenerate annotations without user confirmation - staleness is informational only
- Annotation source must be tagged as 'claude' or 'manual' - never leave unspecified

### Storage & Privacy
- Never store file content directly - always use content hash with separate blob storage
- All file paths in exclude patterns must be honored - never analyze or store excluded files
- SQLite writes must be atomic - use transactions for multi-table operations
- Never expose internal file paths in API responses without privacy filtering

### UI Rendering
- Graph layout positions must be cached and reused - never recalculate positions for existing nodes
- Never render more than 500 nodes without forced module-level collapse
- WebSocket delta updates must include only changed elements, never full graph re-transmission
- Progress indicators must appear for any operation exceeding 200ms

### Performance Requirements
- Snapshot materialization must complete in <1 second for 200-file projects
- Never block the main thread during Phase B analysis - must be async with work queue
- Memory usage must not exceed 500MB RSS for 200-file projects
- UI updates must render in <500ms from transaction commit to visual change

## Stack
- **Backend**: Node.js + TypeScript + Express + WebSocket
- **Analysis**: tree-sitter (Phase A) + TypeScript Language Service (Phase B)
- **Storage**: SQLite + better-sqlite3
- **File Watching**: chokidar
- **Graph**: graphlib + dagre layout
- **Frontend**: Vite + React + TypeScript + D3 + Zustand

## Testing
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:watch         # Watch mode
npm run test:fixtures      # Test with known call graph projects
```

## Slash Commands
| Command | What |
|---------|------|
| /test | Run vitest tests |
| /test-cycle | Generate + run tests progressively |
| /done | Verify before marking complete |
| /review | Spawn review subagent |
| /ship | Test → commit → push → PR |
| /save | Update STATE.md + LOG.md |
| /commit | Stage and commit changes |
| /summarize | AI explain changes |

## Subagents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `code-architect` | Design before implementing | New features, architectural changes |
| `verify-app` | Test implementation works | After implementing, before declaring done |
| `code-simplifier` | Reduce complexity | After feature complete, code feels bloated |
| `build-validator` | Check deployment readiness | Before releases |
| `oncall-guide` | Debug production issues | When investigating errors |

**How to invoke:** Ask Claude to "use code-architect to design this" or "spawn verify-app to test"

## Workflow (Boris-Style)

For non-trivial tasks:

```
1. Think        → Use plan mode or code-architect for design
2. Implement    → Write the code
3. Verify       → Run /test or spawn verify-app
4. Simplify     → Optional: spawn code-simplifier if complex
5. Review       → Run /review (fresh eyes from subagent)
6. Ship         → Run /ship (test → commit → push → PR)
```

**Shortcuts for simple tasks:**
- Bug fix: implement → /test → /done → /commit
- Docs update: edit → /commit

## Key Files
- `src/hooks/adapter.ts` - Claude integration interface
- `src/transactions/manager.ts` - Transaction lifecycle management
- `src/analyzer/pipeline.ts` - Two-phase analysis coordinator
- `src/graph/versioned-graph.ts` - Graph engine with stable node IDs
- `src/storage/sqlite.ts` - Event log and snapshot persistence
- `src/server/express.ts` - REST API and WebSocket server
- `web/src/components/Graph.tsx` - Interactive graph rendering
- `web/src/lib/dagre-layout.ts` - Position-cached layout engine
- `.codeflowrc` - Privacy and retention configuration

## Context Files
| File | Purpose |
|------|---------|
| STATE.md | Current work, decisions |
| LOG.md | History (append-only) |

Long conversation → run `/save`