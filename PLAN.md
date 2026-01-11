# CodeFlow Visualizer: Unified Project Plan

## Vision
A developer tool that provides real-time transparency into AI-assisted coding by tracking file changes, performing multi-tier static analysis, and rendering interactive flow graphs—making the "black box" of LLM code generation observable and reviewable.

---

## Core Design Principles

1. **Claude Integration First**: The differentiating value is AI-specific context. If we can't get rich Claude metadata, this becomes "yet another code viz tool."
2. **Confidence Over Completeness**: Show what we know reliably; clearly mark what's inferred.
3. **Progressive Disclosure**: Default to collapsed/filtered views; users drill down on demand.
4. **Transaction-Aware**: Group changes by logical AI operations, not raw filesystem events.
5. **Local-First Privacy**: Code never leaves the machine; prompts/secrets are redactable.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Transaction Layer                              │
├─────────────────┬───────────────────────────────────────────────────────┤
│  Claude Hooks   │              File Watcher                              │
│  (primary)      │              (fallback/supplementary)                  │
│  - MCP adapter  │              - chokidar                                │
│  - CLI wrapper  │              - rename detection                        │
│  - JSONL ingest │              - content hash tracking                   │
└────────┬────────┴────────────────────┬──────────────────────────────────┘
         │                             │
         └──────────┬──────────────────┘
                    ▼
         ┌──────────────────────┐
         │  Transaction Manager │ ← Groups ops into logical units
         │  (debounce + hooks)  │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │   Analysis Pipeline  │
         │  ┌────────────────┐  │
         │  │ Phase A: Fast  │  │ ← Syntax-only (immediate)
         │  │ (tree-sitter)  │  │
         │  └───────┬────────┘  │
         │          ▼           │
         │  ┌────────────────┐  │
         │  │ Phase B: Deep  │  │ ← Semantic resolution (async)
         │  │ (TS Lang Svc)  │  │
         │  └───────┬────────┘  │
         └──────────┼───────────┘
                    ▼
         ┌──────────────────────┐
         │   Graph Engine       │
         │  - Versioned graph   │
         │  - Delta computation │
         │  - Stable node IDs   │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │   Snapshot Store     │
         │  - Event log         │
         │  - Materialized at   │
         │    intervals/events  │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │   Web Server         │
         │  - REST + WebSocket  │
         │  - Delta publishing  │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │   React + D3 UI      │
         │  - Dagre layout      │
         │  - Position caching  │
         │  - Progressive UI    │
         └──────────────────────┘
```

---

## Data Model

### Core Types

```typescript
// Transaction: The atomic unit of change
interface Transaction {
  id: string;                    // UUID
  startTs: number;
  endTs: number;
  source: 'claude_hook' | 'fs_debounce';
  fileOps: FileOp[];
  hookMetadata?: HookMetadata;   // Only when source is claude_hook
  status: 'open' | 'committed' | 'cancelled';
}

// File Operations
interface FileOp {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string;              // For renames
  contentHash: string;
  timestamp: number;
  diff?: string;                 // Unified diff for modify
}

// Claude Hook Integration
interface HookMetadata {
  sessionId: string;
  stepId: string;
  toolName?: string;
  intent?: string;               // 'refactor' | 'add_feature' | 'fix_bug' | etc.
  promptRedacted?: string;       // Configurable retention
  traceId?: string;
}

// Graph Nodes
interface GraphNode {
  id: string;                    // Stable: `${fileId}:${kind}:${name}:${hash}`
  kind: 'module' | 'function' | 'class' | 'variable';
  name: string;
  filePath: string;
  location: { start: number; end: number };
  lastModified: number;
  transactionId?: string;        // Which transaction last touched this
}

// Graph Edges
interface GraphEdge {
  id: string;
  source: string;                // Node ID
  target: string;                // Node ID
  type: 'imports' | 'calls' | 'defines' | 'flows_to';
  confidence: 'exact' | 'typechecked' | 'heuristic';
  transactionId?: string;
}

// Snapshots
interface Snapshot {
  id: string;
  timestamp: number;
  transactionId?: string;        // If triggered by transaction commit
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    analysisTimeMs: number;
    changedSinceLastSnapshot: string[];  // Node IDs
  };
}
```

### Stable Node Identity

Nodes maintain identity across time via:
1. **Primary key**: `(canonicalPath, kind, name, signatureHash)`
2. **Rename tracking**: Store `(contentHash, size)` to detect file moves
3. **Symbol moves**: Fuzzy match by `(name, kind, bodyHash)` within same transaction

---

## Analysis Tiers (Explicitly Scoped)

| Tier | What | How | Confidence | V0 Scope |
|------|------|-----|------------|----------|
| **0** | Module import graph | Parse `import`/`require`/`export` | `exact` | ✅ MVP |
| **1a** | Local call graph | Function calls within a file | `exact` | ✅ MVP |
| **1b** | Cross-module calls | Resolve via TS type checker | `typechecked` | ✅ MVP |
| **1c** | Unresolved calls | Name-based heuristic matching | `heuristic` | ✅ MVP (flagged) |
| **2** | Data flow lite | Arg→param, return→assignment | `typechecked` | ⏳ V1 |
| **3** | Deep data flow | Full interprocedural analysis | — | ⏳ Future (CodeQL) |

**V0 explicitly excludes**: Python support, runtime tracing, deep data flow.

---

## Claude Integration Strategy

### Priority: Spike This First (Days 1-3)

Before building the full pipeline, validate Claude hook availability:

```
Investigation checklist:
□ Does Claude Code expose MCP (Model Context Protocol) hooks?
□ Can we intercept Claude CLI subprocess stdio?
□ Is there a file-based protocol (e.g., .claude/events.jsonl)?
□ Can we wrap the Claude CLI to capture tool invocations?
□ What metadata is available? (step ID, tool name, file list?)
```

### Hook Adapter Interface

```typescript
interface ClaudeHookAdapter {
  // Returns async iterator of hook events
  subscribe(workspacePath: string): AsyncIterable<HookEvent>;
  
  // Version for schema evolution
  readonly protocolVersion: string;
}

interface HookEvent {
  version: 'v1';
  sessionId: string;
  stepId: string;
  timestamp: number;
  type: 'step_start' | 'step_end' | 'tool_call' | 'file_write';
  toolName?: string;
  filesTouched?: string[];
  metadata?: Record<string, unknown>;
}
```

### Fallback Strategy

If no Claude hooks available:
1. Use FS watcher with smart debouncing (500ms window)
2. Infer transaction boundaries from edit burst patterns
3. Still valuable, but clearly communicate "AI context unavailable" in UI

---

## Technical Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **File watching**: chokidar with rename detection via content hash
- **Analysis (Phase A)**: tree-sitter (fast, multi-language ready)
- **Analysis (Phase B)**: TypeScript Language Service (incremental, semantic)
- **Graph data structure**: graphlib
- **Storage**: SQLite (event log + snapshots) + in-memory (live graph)
- **API**: Express + WebSocket

### Frontend
- **Framework**: Vite + React + TypeScript
- **Graph rendering**: D3 with dagre layout (deterministic positioning)
- **State management**: Zustand (lightweight)

### Why These Choices

| Choice | Rationale |
|--------|-----------|
| tree-sitter for Phase A | Fast (10-50ms per file), incremental parsing, multi-language without separate backends |
| TS Language Service for Phase B | Incremental compilation, handles `tsconfig.json` paths, project references |
| Dagre over force-directed | Deterministic layout = stable positions across snapshots; no jitter |
| SQLite over JSON files | Query by time, by file, by transaction; proper indexes; atomic writes |

---

## Transaction & Cadence Strategy

### Transaction Lifecycle

```
1. Claude hook fires "step_start" → Open transaction
2. File events accumulate into transaction
3. Claude hook fires "step_end" → Commit transaction → Trigger analysis
   OR
   No hook available → 500ms debounce window closes → Commit transaction
4. Cancelled if superseded by new transaction before analysis completes
```

### Analysis Work Queue

```typescript
class AnalysisQueue {
  // New transaction cancels in-flight analysis
  enqueue(transaction: Transaction): void;
  
  // Returns latest completed analysis
  getLatest(): AnalysisResult | null;
  
  // Phase A completes fast, Phase B may be cancelled
  onPhaseComplete(phase: 'A' | 'B', callback: (result) => void): void;
}
```

### Snapshot Publishing

- **Trigger**: Transaction commit OR configurable timer (default: every 5s if changes exist)
- **WebSocket message**: `{ type: 'snapshot_available', snapshotId, timestamp, changedNodeCount }`
- **UI pulls**: Full snapshot on first load; deltas on subsequent updates
- **Delta payload**: `{ addedNodes, removedNodes, modifiedNodes, addedEdges, removedEdges }`

---

## UI Design: Anti-Hairball Requirements

### Default View: Module Graph (Collapsed)

```
┌─────────────────────────────────────────────────────────────┐
│  [Search: ___________]  [Filters: ▼]  [Cadence: 5s ▼]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     ┌─────────┐         ┌─────────┐         ┌─────────┐    │
│     │ src/api │────────▶│src/core │◀────────│src/utils│    │
│     │  (12)   │         │  (24)   │         │   (8)   │    │
│     └─────────┘         └─────────┘         └─────────┘    │
│          │                   │                              │
│          └───────────────────┼──────────────────────────────│
│                              ▼                              │
│                        ┌─────────┐                          │
│                        │  src/db │                          │
│                        │   (5)   │                          │
│                        └─────────┘                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Timeline: [●───────────────────────────●] 14:32:15        │
│            └ Transaction #7: "Add auth middleware"          │
└─────────────────────────────────────────────────────────────┘
```

### Progressive Disclosure

1. **Module level**: Default, shows folder/package nodes with counts
2. **Click module**: Expands to show functions/classes within
3. **Click function**: Shows detail panel with code location, last modified, edges
4. **Shift+click**: Show only k-hop neighborhood (default k=2)

### Visual Indicators

- **Recently changed**: Yellow glow on nodes/edges touched in current transaction
- **Confidence**: Solid lines = exact/typechecked; dashed = heuristic
- **Edge type toggle**: Checkbox filters for imports/calls/defines

### Layout Stability

```typescript
interface LayoutCache {
  // Store positions keyed by node ID
  positions: Map<string, { x: number; y: number }>;
  
  // On new snapshot: run dagre with existing positions as hints
  // Only new nodes get fresh positions
  updateLayout(snapshot: Snapshot): void;
}
```

---

## Storage Schema

```sql
-- Event log (primary source of truth)
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,
  source TEXT NOT NULL,  -- 'claude_hook' | 'fs_debounce'
  hook_metadata JSON,
  status TEXT NOT NULL   -- 'open' | 'committed' | 'cancelled'
);

CREATE TABLE file_ops (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  old_path TEXT,
  content_hash TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  diff TEXT
);

-- File content dedup
CREATE TABLE file_blobs (
  content_hash TEXT PRIMARY KEY,
  content BLOB NOT NULL
);

-- Materialized snapshots (every N transactions or N seconds)
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  transaction_id TEXT REFERENCES transactions(id),
  graph_json JSON NOT NULL,  -- Full node/edge serialization
  stats JSON NOT NULL
);

-- Indexes
CREATE INDEX idx_transactions_ts ON transactions(start_ts);
CREATE INDEX idx_file_ops_path ON file_ops(path);
CREATE INDEX idx_snapshots_ts ON snapshots(timestamp);
```

### Retention Policy

- **Default**: Keep last 24 hours of transactions, last 100 snapshots
- **Configurable**: `--retention-hours=N` and `--max-snapshots=N`
- **Manual**: `codeflow prune --before=<timestamp>`

---

## Privacy & Security Controls

```typescript
interface PrivacyConfig {
  // What to store from Claude hooks
  promptRetention: 'never' | 'redacted' | 'full';
  
  // Patterns to exclude from analysis
  excludePatterns: string[];  // e.g., ['**/*.secret.ts', '**/credentials/**']
  
  // Local-only mode (no network, explicit)
  localOnly: boolean;  // Default: true
}
```

Default `.codeflowrc`:
```json
{
  "promptRetention": "never",
  "excludePatterns": ["**/.env*", "**/secrets/**"],
  "localOnly": true
}
```

---

## Implementation Plan

### Week 0: Claude Integration Spike (Days 1-3)

**Goal**: Determine if rich Claude context is achievable.

- [ ] Investigate Claude Code's hook mechanisms (MCP, CLI, files)
- [ ] Build minimal `ClaudeHookAdapter` prototype
- [ ] Test correlation: hook event → file changes
- [ ] Document findings and fallback strategy

**Exit criteria**: Clear answer on what metadata is available. If nothing useful, pivot to "general AI coding viz" framing.

### Week 1: Core Pipeline (Days 4-10)

#### Days 4-5: Transaction Manager + File Watcher
```bash
mkdir codeflow && cd codeflow
npm init -y
npm install typescript chokidar express ws better-sqlite3
npm install -D @types/node @types/express @types/better-sqlite3 tsx
```

- [ ] Implement `FileWatcher` with content hash tracking
- [ ] Implement rename detection via `(hash, size)` matching
- [ ] Build `TransactionManager` with debounce + hook integration
- [ ] SQLite schema setup + basic event persistence
- [ ] Unit tests with fixture directories

#### Days 6-8: Two-Phase Analysis Pipeline

- [ ] Phase A: tree-sitter integration for JS/TS
  - Extract imports, exports, function declarations, call sites
  - ~50ms per file target
- [ ] Phase B: TS Language Service wrapper
  - Incremental `createLanguageService` setup
  - Cross-module call resolution via type checker
  - Confidence tagging on edges
- [ ] Work queue with cancellation
- [ ] Integration tests with known call graphs

#### Days 9-10: Graph Engine + Snapshot Store

- [ ] Implement `VersionedGraph` with stable node IDs
- [ ] Delta computation between snapshots
- [ ] Snapshot materialization on transaction commit
- [ ] REST endpoints: `/api/snapshots/latest`, `/api/snapshots/:id`
- [ ] WebSocket: `snapshot_available` + delta push

### Week 2: Web UI (Days 11-17)

#### Days 11-13: Graph Rendering Foundation

```bash
cd web && npm create vite@latest . -- --template react-ts
npm install d3 dagre @types/d3
```

- [ ] Dagre layout engine with position caching
- [ ] D3 SVG rendering with zoom/pan
- [ ] WebSocket client for snapshot updates
- [ ] Basic node/edge rendering with confidence styling

#### Days 14-15: Progressive Disclosure UI

- [ ] Collapsible module nodes (folder grouping)
- [ ] Click-to-expand function list
- [ ] Detail panel: code location, last modified, transaction context
- [ ] Shift+click for neighborhood subgraph

#### Days 16-17: Timeline & Filters

- [ ] Timeline slider with transaction markers
- [ ] "Changed since last snapshot" highlighting
- [ ] Edge type toggle filters
- [ ] Search by symbol name
- [ ] Confidence threshold slider

### Week 3: Integration & Polish (Days 18-21)

- [ ] End-to-end testing on real projects (50-file, 200-file)
- [ ] Performance profiling: target <500ms incremental update
- [ ] Error handling: syntax errors, partial files, missing imports
- [ ] CLI: `codeflow watch ./project --port=3000 --cadence=5s`
- [ ] Documentation + README with GIF demo

---

## File Structure

```
codeflow/
├── src/
│   ├── hooks/              # Claude integration adapters
│   │   ├── adapter.ts      # Interface definition
│   │   ├── mcp.ts          # MCP adapter (if available)
│   │   ├── cli-wrapper.ts  # CLI subprocess wrapper
│   │   └── fallback.ts     # FS-only fallback
│   ├── watcher/
│   │   ├── file-watcher.ts
│   │   └── rename-detector.ts
│   ├── transactions/
│   │   ├── manager.ts
│   │   └── types.ts
│   ├── analyzer/
│   │   ├── pipeline.ts     # Two-phase coordinator
│   │   ├── phase-a.ts      # tree-sitter fast pass
│   │   ├── phase-b.ts      # TS language service
│   │   └── work-queue.ts
│   ├── graph/
│   │   ├── versioned-graph.ts
│   │   ├── node-identity.ts
│   │   └── delta.ts
│   ├── storage/
│   │   ├── sqlite.ts
│   │   └── snapshots.ts
│   ├── server/
│   │   ├── express.ts
│   │   └── websocket.ts
│   └── index.ts            # CLI entry point
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Graph.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── DetailPanel.tsx
│   │   │   └── Filters.tsx
│   │   ├── hooks/
│   │   │   ├── useSnapshot.ts
│   │   │   └── useLayout.ts
│   │   ├── lib/
│   │   │   ├── dagre-layout.ts
│   │   │   └── d3-renderer.ts
│   │   └── App.tsx
│   └── index.html
├── test/
│   ├── fixtures/           # Known call graph projects
│   └── *.test.ts
├── .codeflowrc.example
└── package.json
```

---

## Success Criteria

### MVP (Week 3)

1. ✅ `codeflow watch ./project` starts and opens browser UI
2. ✅ Graph updates within 3 seconds of file save
3. ✅ Correctly identifies: new files, modified functions, import changes
4. ✅ Cross-module call resolution with confidence indicators
5. ✅ Timeline scrubbing through recent transactions
6. ✅ Module-level collapse/expand working
7. ✅ Works on 50-file TS project without perceptible lag (<500ms updates)

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Phase A analysis | <100ms per file | Instrumented timing |
| Phase B analysis | <1s for 10 changed files | Instrumented timing |
| Snapshot publish latency | <500ms from transaction commit | End-to-end timer |
| UI render | <200ms for 500-node graph | Browser devtools |
| Memory (200-file project) | <500MB RSS | Process monitor |

### Testing Requirements

- [ ] Unit tests for analyzer with fixture projects containing known call graphs
- [ ] Integration test: modify file → verify correct edge changes
- [ ] Rename test: move file → verify node identity preserved
- [ ] Stress test: rapid edits (10 files/second) → verify no crashes, reasonable lag

---

## Future Scope (Post-MVP)

### V1 (4-6 weeks out)
- Data flow lite (arg/return tracking)
- Diff view: "what changed this transaction" with code snippets
- Export to Mermaid/DOT for documentation

### V2 (3+ months out)
- Python support via tree-sitter + language server
- VS Code extension (embedded webview)
- Runtime tracing integration for actual execution paths
- Multi-user collaboration (shared session viewing)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude hooks unavailable/insufficient | Spike first; fallback to FS-only with clear UX |
| TS Language Service too slow | Cache aggressively; Phase A provides immediate feedback |
| Graph becomes unreadable | Progressive disclosure is MVP requirement, not nice-to-have |
| Syntax errors during active editing | Graceful degradation: show last valid analysis, mark stale |
| Large monorepos | Explicit include paths; respect `.gitignore`; project reference support |

---

## Open Decisions (Resolve During Implementation)

1. **Default cadence**: 2s vs 5s vs 10s? (Start with 5s, make configurable)
2. **Max graph size before forced collapse**: 200 nodes? 500? (Test empirically)
3. **Hook event format versioning**: Strict schema validation vs permissive parsing?
4. **Delta vs full snapshot over WebSocket**: Depends on typical snapshot size (measure first)