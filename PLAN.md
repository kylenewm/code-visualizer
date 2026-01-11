# CodeFlow Viz - Implementation Plan

## Project Overview
Real-time code flow visualization tool that tracks:
1. Build-time changes (files created/modified by Claude)
2. Static call graphs and data flow between functions
3. Periodic snapshots rendered in a web UI

## Core Features

### Build Tracking
- Watch file system for creates/edits/deletes
- Integrate with Claude Code hooks for richer context
- Timeline view of changes with diffs
- Group related changes into "sessions"

### Flow Analysis
- Parse source code to AST using tree-sitter
- Extract function definitions and call sites
- Build directed graph of function → function calls
- Track imports/exports between modules
- Identify data flow (variable assignments, returns)

### Visualization
- Interactive directed graph (D3.js force layout)
- Click node → show source code
- Hover → show file:line, parameters, return type
- Filter by: file, function name, module
- Zoom to fit, focus on selection

## Technical Architecture

### Stack
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Backend**: Express.js
- **Frontend**: React 18 + Vite
- **Visualization**: D3.js v7
- **Parser**: tree-sitter with language bindings
- **Database**: better-sqlite3
- **File Watching**: chokidar

### Database Schema
```sql
-- Snapshots of analysis runs
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_path TEXT NOT NULL,
  file_count INTEGER,
  node_count INTEGER,
  edge_count INTEGER
);

-- Files tracked in each snapshot
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  last_modified DATETIME,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
);

-- Functions/symbols extracted
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'function', 'class', 'method', 'variable'
  line_start INTEGER,
  line_end INTEGER,
  signature TEXT,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Edges between nodes (calls, imports, etc.)
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  source_node_id INTEGER NOT NULL,
  target_node_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'calls', 'imports', 'extends', 'uses'
  line INTEGER,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id),
  FOREIGN KEY (source_node_id) REFERENCES nodes(id),
  FOREIGN KEY (target_node_id) REFERENCES nodes(id)
);

-- File change events (build tracking)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL, -- 'create', 'modify', 'delete'
  path TEXT NOT NULL,
  session_id TEXT,
  diff TEXT
);

CREATE INDEX idx_nodes_snapshot ON nodes(snapshot_id);
CREATE INDEX idx_edges_snapshot ON edges(snapshot_id);
CREATE INDEX idx_events_session ON events(session_id, timestamp);
```

### API Endpoints
```
GET  /api/snapshots              - List all snapshots
GET  /api/snapshots/:id          - Get snapshot with nodes/edges
POST /api/analyze                - Trigger new analysis
GET  /api/events                 - Get recent file events
GET  /api/events/stream          - SSE stream of live events
GET  /api/graph/:snapshotId      - Get graph data for visualization
GET  /api/source/:fileId/:line   - Get source code snippet
```

### File Structure
```
codeflow-viz/
├── src/
│   ├── watcher/
│   │   ├── index.ts           # Chokidar file watcher
│   │   └── hooks.ts           # Claude Code hooks integration
│   ├── parser/
│   │   ├── index.ts           # Tree-sitter setup
│   │   ├── languages.ts       # Language bindings
│   │   └── extract.ts         # Extract nodes/edges from AST
│   ├── analyzer/
│   │   ├── flow.ts            # Build call graph
│   │   ├── imports.ts         # Track module dependencies
│   │   └── snapshot.ts        # Create/store snapshots
│   ├── storage/
│   │   ├── db.ts              # SQLite setup
│   │   ├── snapshots.ts       # Snapshot CRUD
│   │   └── events.ts          # Event logging
│   ├── server/
│   │   ├── index.ts           # Express app
│   │   ├── routes/            # API routes
│   │   └── sse.ts             # Server-sent events
│   ├── web/
│   │   ├── App.tsx            # Main React app
│   │   ├── components/
│   │   │   ├── FlowGraph.tsx  # D3 graph visualization
│   │   │   ├── Timeline.tsx   # Build event timeline
│   │   │   ├── SourceView.tsx # Code snippet viewer
│   │   │   └── FilterBar.tsx  # Filter controls
│   │   └── hooks/
│   │       ├── useGraph.ts    # Graph data fetching
│   │       └── useEvents.ts   # SSE event stream
│   └── cli/
│       ├── index.ts           # CLI entry point
│       ├── watch.ts           # Start watcher command
│       └── analyze.ts         # Run analysis command
├── lib/
│   └── db.ts                  # Shared database utilities
├── tests/
│   ├── parser.test.ts
│   ├── analyzer.test.ts
│   └── api.test.ts
└── package.json
```

## Implementation Phases

### Phase 1: Foundation
- Project setup (TypeScript, ESLint, Vite)
- SQLite database with schema
- Basic Express server
- File watcher with chokidar

### Phase 2: Parser
- tree-sitter setup for JS/TS
- Extract function definitions
- Extract call sites
- Build initial node/edge data

### Phase 3: Storage & API
- Snapshot creation and storage
- API routes for snapshots and graph data
- Event logging for file changes

### Phase 4: Visualization
- React app scaffold
- D3.js force-directed graph
- Click/hover interactions
- Filter controls

### Phase 5: Build Tracking
- Claude Code hooks integration
- Timeline view of changes
- Session grouping
- SSE for live updates

### Phase 6: Polish
- Multi-language support (Python, Go)
- Performance optimization
- CLI commands
- Documentation

## Supported Languages (Initial)
- JavaScript / TypeScript
- Python (Phase 6)
- Go (Phase 6)

## Known Limitations
- Large codebases (>10k files) may be slow on first analysis
- Dynamic calls (eval, computed properties) not tracked
- Minified code produces poor graphs
- No cross-repository analysis

## Success Criteria
- [ ] Watch a directory and log file changes
- [ ] Parse JS/TS files and extract functions
- [ ] Build call graph from parsed data
- [ ] Store snapshots in SQLite
- [ ] Visualize graph in web UI with zoom/pan
- [ ] Click node to see source code
- [ ] Filter by file or function name
- [ ] Show timeline of build events
