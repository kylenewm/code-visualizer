# CodeFlow Visualizer: Unified Project Plan

## Vision

A developer tool that helps you **understand how your code flows** — especially when AI makes many changes at once. Real-time change detection is the entry point; deep flow visualization is the core value.

**The problem:** When Claude modifies 10-15 files in one session, it's hard to understand:
- How the changed functions connect to each other
- What calls what, and how data flows through
- The overall structure of what was built or modified

**The solution:** Detect changes in real-time → Visualize the call graph, imports, and data flow → Let you explore relationships interactively.

---

## Core Design Principles

1. **Flow Understanding First**: The primary value is seeing how code connects — call chains, data flow, module dependencies. Change tracking is the trigger, not the goal.
2. **Real-Time Entry Point**: Changes appear immediately, giving you an entry point to explore the flow graph.
3. **Deep on Demand**: Start with module-level view, drill into functions, then into specific call chains.
4. **Confidence Over Completeness**: Show what we know reliably; clearly mark what's inferred (heuristic vs typechecked).
5. **Local-First Privacy**: Code never leaves the machine; all analysis is local.

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. CHANGE DETECTED                                                     │
│     "Claude just modified: api/auth.ts, services/user.ts, db/schema.ts" │
│     [Click any file to explore]                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. MODULE VIEW (entry point)                                           │
│                                                                         │
│     ┌─────────┐         ┌───────────┐         ┌──────────┐             │
│     │ api/    │────────▶│ services/ │────────▶│   db/    │             │
│     │ (3 fn)  │         │  (5 fn)   │         │  (2 fn)  │             │
│     └─────────┘         └───────────┘         └──────────┘             │
│         ▲                                                               │
│     [recently changed = highlighted]                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (click to expand)
┌─────────────────────────────────────────────────────────────────────────┐
│  3. FUNCTION VIEW (call graph)                                          │
│                                                                         │
│     login() ──▶ validateUser() ──▶ findUserByEmail() ──▶ query()       │
│        │              │                    │                            │
│        │              ▼                    ▼                            │
│        │       hashPassword()        UserSchema                         │
│        ▼                                                                │
│     createSession()                                                     │
│                                                                         │
│     [solid lines = exact, dashed = heuristic]                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (click function for detail)
┌─────────────────────────────────────────────────────────────────────────┐
│  4. DETAIL PANEL                                                        │
│                                                                         │
│     validateUser(email: string, password: string): Promise<User | null> │
│                                                                         │
│     Location: services/user.ts:45-62                                    │
│     Last modified: 2 minutes ago                                        │
│                                                                         │
│     Calls:                          Called by:                          │
│     • findUserByEmail() [exact]     • login() [exact]                   │
│     • hashPassword() [exact]        • resetPassword() [heuristic]       │
│                                                                         │
│     Data flow:                                                          │
│     email ──▶ findUserByEmail(arg0) ──▶ user.email                     │
│     password ──▶ hashPassword(arg0) ──▶ comparison                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Change Detection Layer                            │
├─────────────────┬───────────────────────────────────────────────────────┤
│  Claude Hooks   │              File Watcher (fallback)                   │
│  PostToolUse    │              chokidar + debounce                       │
└────────┬────────┴────────────────────┬──────────────────────────────────┘
         │                             │
         └──────────┬──────────────────┘
                    ▼
         ┌──────────────────────┐
         │  Change Aggregator   │ ← "these files changed"
         │  (triggers analysis) │
         └──────────┬───────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Analysis Engine (CORE)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐     ┌────────────────────┐                      │
│  │ Phase A: Structure │     │ Phase B: Semantics │                      │
│  │ (tree-sitter)      │     │ (TS Language Svc)  │                      │
│  │ • Functions        │     │ • Type resolution  │                      │
│  │ • Imports/exports  │     │ • Cross-file calls │                      │
│  │ • Call sites       │     │ • Data flow        │                      │
│  │ • Classes          │     │ • Confidence tags  │                      │
│  └────────────────────┘     └────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │   Graph Engine       │
         │  • Nodes (functions, │
         │    classes, modules) │
         │  • Edges (calls,     │
         │    imports, flow)    │
         │  • Query API         │
         └──────────┬───────────┘
                    │
         ┌──────────┴───────────┐
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│  SQLite Store   │    │   WebSocket     │
│  (persistence)  │    │   (real-time)   │
└─────────────────┘    └────────┬────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │   React + D3 UI      │
                    │  • Flow graph        │
                    │  • Call chains       │
                    │  • Detail panels     │
                    │  • Change highlights │
                    └──────────────────────┘
```

---

## Data Model

### Graph Nodes (Code Elements)

```typescript
type NodeKind = 'module' | 'function' | 'class' | 'method' | 'variable' | 'type';

interface GraphNode {
  id: string;                    // Stable: `${fileHash}:${kind}:${name}:${sigHash}`
  kind: NodeKind;
  name: string;
  filePath: string;
  location: { startLine: number; endLine: number };
  signature?: string;            // e.g., "(email: string, password: string): Promise<User>"
  params?: Array<{ name: string; type?: string }>;
  returnType?: string;
  exported: boolean;
  parentId?: string;             // For methods: their class ID
  lastModified?: number;         // Timestamp of last change
}
```

### Graph Edges (Relationships)

```typescript
type EdgeType =
  | 'imports'       // Module imports another
  | 'calls'         // Function calls function
  | 'instantiates'  // Creates instance of class
  | 'extends'       // Class extends class
  | 'implements'    // Class implements interface
  | 'uses'          // Variable/type usage
  | 'param_flow'    // Argument flows to parameter
  | 'return_flow';  // Return value flows to assignment

type EdgeConfidence = 'exact' | 'typechecked' | 'heuristic';

interface GraphEdge {
  id: string;
  source: string;                // Node ID
  target: string;                // Node ID
  type: EdgeType;
  confidence: EdgeConfidence;
  callSite?: { line: number; col: number };
  label?: string;                // e.g., "arg0", "returns"
}
```

### Call Chain (For Flow Exploration)

```typescript
interface CallChain {
  root: string;                  // Starting node ID
  chain: Array<{
    caller: string;
    callee: string;
    callSite: { line: number; col: number };
  }>;
  depth: number;
}
```

---

## Analysis Tiers

| Tier | What | How | Confidence | Priority |
|------|------|-----|------------|----------|
| **0** | Module import graph | Parse `import`/`require`/`export` | `exact` | MVP |
| **1a** | Local call graph | Function calls within a file | `exact` | MVP |
| **1b** | Cross-module calls | Resolve via TS type checker | `typechecked` | MVP |
| **1c** | Unresolved calls | Name-based heuristic matching | `heuristic` | MVP (flagged) |
| **2** | Data flow lite | Arg→param, return→assignment | `typechecked` | MVP (basic) |
| **3** | Deep data flow | Full interprocedural analysis | — | Future |

**MVP includes basic data flow** because understanding "where does this value go" is core to flow understanding.

---

## Claude Hooks Integration

### Confirmed Available (from investigation)

| Hook Event | What We Get | Use Case |
|------------|-------------|----------|
| `PostToolUse` | `file_path`, `content`, `tool_name` | Detect file changes |
| `SessionStart` | `session_id`, `cwd` | Initialize analyzer |
| `Stop` | `reason`, `transcript_path` | Session boundary |

### Hook Implementation

```typescript
// .claude/hooks/on-file-change.ts
// Receives: { tool_name: "Write"|"Edit", tool_input: { file_path, content } }
// Sends to: codeflow analyzer via HTTP or file

interface HookInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: {
    file_path: string;
    content?: string;      // Write
    new_string?: string;   // Edit
    old_string?: string;   // Edit
  };
  session_id: string;
  transcript_path: string;
}
```

### Fallback (Non-Claude Edits)

```typescript
// chokidar watches project directory
// 500ms debounce window
// Groups rapid changes into one analysis trigger
```

---

## Technical Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Analysis (Phase A)**: tree-sitter (fast, multi-language ready)
- **Analysis (Phase B)**: TypeScript Language Service (semantic resolution)
- **Graph**: graphlib (in-memory) + custom query layer
- **Storage**: SQLite (persistence) + better-sqlite3
- **API**: Express + WebSocket (ws)

### Frontend
- **Framework**: Vite + React + TypeScript
- **Graph rendering**: D3 with dagre layout
- **State**: Zustand

### Why These Choices

| Choice | Rationale |
|--------|-----------|
| tree-sitter | 10-50ms per file, incremental, multi-language |
| TS Language Service | Semantic resolution, type-aware cross-file calls |
| Dagre | Deterministic layout, no jitter between updates |
| SQLite | Query by file, by time; proper indexes; atomic writes |

---

## Implementation Plan

### Phase 1: Analysis Engine (Days 1-5) ← PRIORITY

**Goal**: Parse code, build call graph, answer "what calls what"

- [ ] tree-sitter integration for TypeScript/JavaScript
  - Extract: functions, classes, methods, imports, exports
  - Extract: call sites (function calls, method calls)
  - Target: <100ms per file
- [ ] Build in-memory graph with nodes and edges
- [ ] Implement query API:
  - `findCallers(nodeId)` - who calls this function?
  - `findCallees(nodeId)` - what does this function call?
  - `getCallChain(nodeId, depth)` - full call chain
  - `getModuleDeps(filePath)` - imports/exports
- [ ] Unit tests with fixture projects

### Phase 2: Semantic Resolution (Days 6-8)

**Goal**: Cross-file call resolution, confidence tagging

- [ ] TypeScript Language Service wrapper
- [ ] Resolve cross-module function calls
- [ ] Tag edge confidence: exact, typechecked, heuristic
- [ ] Basic data flow: arg → param tracking
- [ ] Integration tests with known call graphs

### Phase 3: Change Detection (Days 9-10)

**Goal**: Real-time updates when files change

- [ ] Claude `PostToolUse` hook script
- [ ] Hook triggers re-analysis of changed files
- [ ] chokidar fallback for manual edits
- [ ] Incremental graph updates (not full rebuild)
- [ ] SQLite persistence of graph state

### Phase 4: Web UI (Days 11-17)

**Goal**: Interactive flow visualization

- [ ] Express server + WebSocket for real-time updates
- [ ] React app with D3/dagre rendering
- [ ] Module-level view (collapsed by default)
- [ ] Click-to-expand to function level
- [ ] Call chain visualization (A → B → C → D)
- [ ] Detail panel: signature, location, callers/callees
- [ ] Recently-changed highlighting
- [ ] Edge confidence styling (solid vs dashed)
- [ ] Search by function name

### Phase 5: UX Polish (Priority Matrix)

#### P0 - Ship Immediately (Essential UX)

**Interaction**
- [ ] Keyboard shortcuts (F=focus, Esc=clear, /=search, +/-=zoom, arrows=navigate siblings/parent/child)
- [ ] Hover states (brightness 1.2, stroke highlight, font-weight change on nodes/edges)
- [ ] Double-click to focus (quick shortcut for focus mode on node)
- [ ] Context menu on right-click (focus, hide, view source, copy path, filter file, expand callees)

**Visual Feedback**
- [ ] Selected node pulse animation (2s ease-in-out infinite, stroke-width 4-6px)
- [ ] Loading skeleton states (show placeholder nodes/edges while data loads)
- [ ] Empty state design (icon + "Select a node to explore" + tip text)
- [ ] Error boundaries (crash recovery with "Try refreshing" message)

**Navigation**
- [ ] Clickable file paths in details panel (click segment to filter by path)
- [ ] Session persistence (save zoom/pan/selection/focus to localStorage)

#### P1 - Essential for Polish (Month 1)

**Visual Design**
- [ ] Edge bundling (d3.bundleEdges with tension 0.85 to reduce spaghetti)
- [ ] Edge direction clarity (scale arrowheads with zoom, orange for visibility)
- [ ] Node label truncation (20 char max + ellipsis, full name in tooltip)
- [ ] Grid background (subtle 50px pattern for distance reference)
- [ ] Color palette enhancement (distinguish exported/utility functions, public/private methods)

**Navigation**
- [ ] Minimap (overview rectangle + viewport indicator, click to jump)
- [ ] Pan constraints (prevent losing graph off-screen)
- [ ] Fit-to-selection (zoom to show selected + N-level neighbors)

**Information**
- [ ] Call chain visualization (tree view in sidebar: caller → current → callees)
- [ ] Filter panel (checkboxes for type, visibility, file dropdown, complexity slider)

**Export**
- [ ] Export as PNG/SVG (svg.outerHTML → blob download)
- [ ] Share view URL (encode node/zoom/focus in URL hash)
- [ ] Export subgraph data (JSON, Mermaid, Markdown)

#### P2 - Competitive Differentiators (Month 2)

**Metrics & Insights**
- [ ] Complexity metrics (cyclomatic complexity, LOC, params count on nodes)
- [ ] Statistics dashboard (totals, avg complexity, most called, hotspots list)
- [ ] Node visual hierarchy (size nodes by call count, height by complexity)
- [ ] Documentation integration (show JSDoc/docstring, params, returns in panel)

**Advanced Interaction**
- [ ] Node pinning (pinned nodes always visible even outside focus)
- [ ] Quick jump to definition (fuzzy search command palette)
- [ ] Expand/collapse inline (+ button on nodes to reveal children in place)
- [ ] Dependency graph toggle (switch between calls/imports/data flow views)

**Polish**
- [ ] Connection status indicator (animated ripple on status dot)
- [ ] Zoom level progress bar (visual indicator alongside percentage)
- [ ] Focus mode boundary (glowing outline around focused cluster)
- [ ] Responsive design (mobile/tablet bottom sheet for details panel)

#### P3 - Explicitly Deferred (Out of Scope)

| Item | Reason |
|------|--------|
| AI-powered insights | Requires ML backend, completely different product. Would need to analyze code patterns, suggest refactors, detect smells. That's a separate tool. |
| Git integration/time-travel | Scope creep. We visualize *current* code flow, not version history. Git tools already exist for that. |
| Live collaboration cursors | Enterprise SaaS feature requiring real-time sync infrastructure. Way out of scope for a developer tool. |
| Multi-select/lasso | Complex interaction model. Focus mode already covers "show me related nodes" use case. |
| Virtual rendering | Premature optimization. Current SVG handles 200 files fine. Only implement if we actually hit perf issues at scale. |
| Debounced search | Already implemented - search only triggers on nodes in current graph, not full re-render. |
| Progressive loading | Over-engineering - full graph loads in <1s for target project sizes. WebSocket already streams updates. |

### Original Phase 5: Production Polish

- [ ] End-to-end testing on real projects
- [ ] Performance profiling (<500ms updates)
- [ ] CLI: `codeflow watch ./project --port=3000`
- [ ] Error handling (syntax errors, partial parses)
- [ ] Documentation

---

## File Structure

```
codeflow-viz/
├── src/
│   ├── analyzer/
│   │   ├── tree-sitter.ts     # Phase A: syntax extraction
│   │   ├── typescript-service.ts  # Phase B: semantic resolution
│   │   ├── pipeline.ts        # Orchestrates both phases
│   │   └── extractor.ts       # Node/edge extraction logic
│   ├── graph/
│   │   ├── graph.ts           # Core graph data structure
│   │   ├── query.ts           # Query API (callers, callees, chains)
│   │   └── delta.ts           # Incremental updates
│   ├── hooks/
│   │   ├── claude-hook.ts     # PostToolUse handler
│   │   └── file-watcher.ts    # chokidar fallback
│   ├── storage/
│   │   └── sqlite.ts          # Persistence layer
│   ├── server/
│   │   ├── express.ts         # REST API
│   │   └── websocket.ts       # Real-time updates
│   ├── types/
│   │   └── index.ts           # Core type definitions
│   └── index.ts               # CLI entry point
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Graph.tsx      # Main flow graph
│   │   │   ├── CallChain.tsx  # Linear call chain view
│   │   │   ├── DetailPanel.tsx
│   │   │   └── ChangeNotification.tsx
│   │   ├── hooks/
│   │   │   ├── useGraph.ts
│   │   │   └── useWebSocket.ts
│   │   ├── lib/
│   │   │   ├── dagre-layout.ts
│   │   │   └── d3-renderer.ts
│   │   └── App.tsx
│   └── index.html
├── test/
│   └── fixtures/              # Projects with known call graphs
├── package.json
├── tsconfig.json
└── .codeflowrc.example
```

---

## Success Criteria

### MVP

1. `codeflow watch ./project` starts and opens browser
2. Shows module-level dependency graph on load
3. Click module → see functions and their call relationships
4. Click function → see callers, callees, signature, location
5. When Claude changes files → graph updates within 3 seconds
6. Changed nodes/edges highlighted
7. Works on 50-file TypeScript project without lag

### Flow Understanding (Core Value)

- [ ] Can answer: "What calls this function?" in one click
- [ ] Can answer: "What does this function call?" in one click
- [ ] Can trace: A → B → C → D call chain visually
- [ ] Can see: which calls are certain vs heuristic
- [ ] Can see: basic data flow (arg → param)

### Performance Targets

| Metric | Target |
|--------|--------|
| Phase A analysis | <100ms per file |
| Phase B analysis | <1s for 10 files |
| Graph update | <500ms after file change |
| UI render | <200ms for 500-node graph |
| Memory | <500MB for 200-file project |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Graph unreadable (hairball) | Collapse to module level by default; progressive disclosure |
| Cross-file resolution slow | Phase A gives immediate feedback; Phase B async |
| Syntax errors break analysis | Graceful degradation; show last valid state |
| Too many nodes | Force module collapse above 500 nodes |

---

## Future Scope

### V1.1 (Post-UX Polish)
- Richer data flow (return → assignment tracking)
- Diff view: code snippets of what changed
- Timeline scrubbing (optional)
- Cross-file call resolution (Phase 2 - TypeScript Language Service)

### V2 (Future)
- VS Code extension
- Runtime tracing integration
- Go/Rust/Java language support

### Completed (Originally Future)
- Python support (done in Phase 1)
- Export to Mermaid/DOT (scheduled for Phase 5 Tier 5)
