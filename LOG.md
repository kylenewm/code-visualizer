# LOG.md

> Append-only. Never edit old entries.

---

## 2026-01-11

### Source Preview Expand/Collapse + Dynamic Node Width

**Source preview improvements:**
- Increased preview lines from 5 to 12 in both extractors
- Added "Show more"/"Show less" button in CallTreeView
- Default shows 5 lines, click to expand to full 12 lines
- Better visibility into function implementations

**Graph node width:**
- Made node width dynamic based on function name length
- MIN_NODE_WIDTH=100px, MAX_NODE_WIDTH=220px
- ~8px per character + 24px padding
- Reduces truncation for longer function names

**Files changed:**
- `src/analyzer/extractor.ts` - PREVIEW_LINES = 12
- `src/analyzer/extractor-python.ts` - PREVIEW_LINES = 12
- `web/src/components/CallTreeView.tsx` - SourcePreview component with expand/collapse
- `web/src/lib/dagre-layout.ts` - getNodeWidth() for dynamic sizing
- `web/src/App.css` - .source-expand-btn styling

**Tested:** council-v2 project with 33 functions, 7 files

---

### Graph View: File Group Visibility Fix

**Problem:** File group rectangles had poor contrast against dark background - hard to distinguish files.

**Solution:**
- Bright distinct colors per file (blue, green, amber, red, purple, cyan, orange, pink)
- Colored strokes (2px, 60% opacity) instead of dark gray
- File name labels in matching color, bolder (12px, 600 weight)
- Node borders also colored by file
- Legend updated to show file colors

**Files changed:**
- `web/src/components/Graph.tsx` - File grouping with better colors
- `web/src/App.css` - Legend section styling

**Note:** Rectangles still overlap when files have nodes in different layout positions (layout is by call graph connectivity, not by file). This is a fundamental limitation - would need layout-by-file-first to fix.

---

### v2 Phase 4 Complete: Polish

Final polish for v2 architecture-first visualization.

**Session persistence (`web/src/lib/session.ts`):**
- Added `expandedModules` and `expandedFiles` to session state
- Expansion state now persists across page refreshes

**Store (`web/src/lib/store.ts`):**
- Added `setExpandedModules(modules)` and `setExpandedFiles(files)` actions
- Added `requestView(view)` action for programmatic view switching

**CallTreeView.tsx:**
- Added "← Architecture" back button in header
- Allows quick return after drill-down

**ArchitectureView.tsx:**
- Added "Expand All" / "Collapse All" buttons in header
- Quickly expand or collapse entire tree

**App.css:**
- View transition animation (fade + slide)
- Back button styling
- Architecture actions button styling

**Tests:** 65/65 passing

---

### v2 Phase 3 Complete: Hierarchical Drill-Down

Clicking functions in Architecture or ChangeFeed now drills down to Walkthrough view.

**Frontend store (`web/src/lib/store.ts`):**
- Added `drillDownEntryId` and `requestedView` state
- Added `drillDownToWalkthrough(nodeId)` - Sets entry point and triggers view switch
- Added `clearDrillDown()` and `clearRequestedView()` actions

**ArchitectureView.tsx updates:**
- Changed function click to use `drillDownToWalkthrough` instead of `navigateToNode`
- Clicking any function drills down to Walkthrough with that function as root

**ChangeFeed.tsx updates:**
- Changed affected function click to use `drillDownToWalkthrough`
- Clicking affected function in change feed drills down to Walkthrough

**App.tsx updates:**
- Added useEffect to watch `requestedView` from store
- Automatically switches view mode when drill-down is triggered

**CallTreeView.tsx updates:**
- Added useEffect to watch `drillDownEntryId` from store
- Sets selected entry point when drilling down
- Auto-expands first level for immediate visibility

**Flow:**
```
Architecture View → Click function → Walkthrough View (function as root)
Change Feed → Click affected function → Walkthrough View (function as root)
```

**Tests:** 65/65 passing

---

### v2 Phase 2 Complete: Change Feed with Git Diffs

Added real-time change tracking with git diff integration.

**Backend (`src/hooks/change-aggregator.ts`):**
- Added `ChangeEvent` type with diff, summary, affectedFunctions, linesAdded/Removed
- Added `getGitDiff()` - Runs git diff to capture changes
- Added `extractAffectedFunctions()` - Parses diff for function names
- Added `recordChangeEvent()` - Stores changes with diffs
- Added `getChangeHistory(limit?)` and `getChangeEvent(id)` methods

**Backend (`src/hooks/change-detector.ts`):**
- Forward `change:recorded` event from aggregator
- Added `getChangeHistory()` and `getChangeEvent()` delegation methods

**Backend (`src/server/express.ts`):**
- Added `GET /api/changes` - List recent changes with diffs
- Added `GET /api/changes/:id` - Get specific change by ID
- Added WebSocket `change:recorded` event broadcast

**Frontend store (`web/src/lib/store.ts`):**
- Added `ChangeEvent` type
- Added `changeEvents` state array
- Added `addChangeEvent`, `setChangeEvents`, `getChangeEvents` actions

**Frontend (`web/src/lib/websocket.ts`):**
- Handle `change:recorded` message, add to store

**New component: `ChangeFeed.tsx`**
- Change cards with type badge (NEW/MOD/DEL)
- File name, lines added/removed summary
- Expandable git diff view with syntax highlighting
- Affected function buttons (click to navigate to node)
- Fetches from `/api/changes` on connect

**App.tsx updates:**
- Replaced RecentChanges with ChangeFeed
- Renamed tab from "Recent" to "Changes"

**CSS (`App.css`):**
- Change card styling with type-colored borders
- Diff line highlighting (green/red for add/remove)
- Affected function buttons

**Tests:** 65/65 passing

---

### v2 Phase 1 Complete: Module-level Architecture View

Replaced 135-node function graph with module-level architecture view (5-15 boxes).

**Backend (`src/types/index.ts`, `src/graph/graph.ts`):**
- Added `ModuleNode`, `ModuleEdge`, `ModuleGraph` types
- Added `getModuleGraph()` method to graph engine
  - Aggregates nodes by directory
  - Tracks function counts, exported counts, recent changes per module
  - Builds edges based on imports between modules
- Added `/api/modules` REST endpoint in `src/server/express.ts`

**Frontend store (`web/src/lib/store.ts`):**
- Added `ModuleNode`, `ModuleEdge`, `ModuleGraph` types
- Added `moduleGraph`, `expandedModules`, `expandedFiles` state
- Added `setModuleGraph`, `toggleModuleExpanded`, `toggleFileExpanded` actions

**New component: `ArchitectureView.tsx`**
- Module cards with expand/collapse
- File rows with function counts
- Function list with kind indicators
- CHANGED badges for recently modified modules/files/functions
- Dependencies section showing module-to-module imports
- Fetches from `/api/modules` on connect and when graph updates

**App.tsx updates:**
- Added "Architecture" tab as the default view
- Four-tab layout: Architecture | Recent | Walkthrough | Graph
- Updated keyboard hints for 4 views

**CSS (`App.css`):**
- Module group styling
- Module card with expand/collapse
- File rows with function counts
- Function list with kind indicators

**Tests:** 65/65 passing

---

### Test Harness Complete

Built comprehensive test suite for self-evaluation:

**E2E Fixture (`test/fixtures/e2e-project/`):**
- `app.ts` - Single-file app with known call graph
- `expected.json` - Expected nodes, edges, call tree, entry points
- Tests within-file call resolution (cross-file not yet implemented)

**Integration Tests (`test/e2e.test.ts`):** 16 tests
- Node extraction (functions, classes, exports)
- Source previews and JSDoc descriptions
- Call graph edges verification
- `findCallers` / `findCallees` queries
- Call tree building from entry point
- Entry point detection
- Search (exact and partial)
- Neighborhood subgraph
- Statistics

**API Tests (`test/api.test.ts`):** 13 tests
- `GET /api/health` - status check
- `GET /api/stats` - graph statistics
- `GET /api/graph` - full graph data
- `GET /api/search?q=` - node search
- `GET /api/nodes/:id` - node by ID
- `GET /api/nodes/:id/callers` - callers
- `GET /api/nodes/:id/callees` - callees
- `GET /api/nodes/:id/chain` - call chain
- `GET /api/nodes/:id/neighborhood` - subgraph
- `GET /api/files` - file listing

**Playwright UI Tests (`test/ui/app.spec.ts`):** 13 tests
- App loads with title
- View tabs visible
- View switching works
- Status bar, keyboard hints, search bar
- Graph view: container, zoom controls
- Walkthrough view: tree, entry selector, depth control
- Recent changes panel
- Node details empty state

**Test Commands:**
- `npm test` - Unit + integration tests (65 tests)
- `npm run test:ui` - Playwright tests (13 tests)
- `npm run test:all` - All tests (78 tests)

**Dependencies added:** supertest, @playwright/test

---

### Phase 3 Complete: Call Tree Walkthrough View

Built the walkthrough view for understanding execution flow:

**Backend (`src/types/index.ts`, `src/graph/graph.ts`):**
- Added `CallTreeNode` interface (node, children, depth, isRecentlyModified)
- Added `getCallTree(nodeId, maxDepth, recentThresholdMs)` method
  - Recursively builds nested tree of callees
  - Marks recently modified nodes
  - Sorts children by source location for execution order
  - Handles cycles with visited set

**Frontend store (`web/src/lib/store.ts`):**
- Added `CallTreeNode` type
- Added `getCallTree(nodeId, maxDepth)` selector
- Added `getEntryPoints()` selector (exported functions with no callers)

**New component: `CallTreeView.tsx`**
- Entry point selector with auto-detection
  - Prioritizes recently modified exported functions
  - Falls back to any exported function with no callers
- Nested tree view with collapsible nodes
- Inline source preview at each step
- [CHANGED] badges on recently modified nodes
- Depth control slider (1-10 levels)
- Expand All / Collapse All buttons
- Step numbers for execution order

**App.tsx updates:**
- Added "Walkthrough" tab (Recent | Walkthrough | Graph)
- Updated keyboard hints (1/2/3 for views)

**CSS (`App.css`):**
- Tree node styling with indentation via CSS variables
- Toggle expand/collapse buttons
- Source preview boxes
- CHANGED badge styling

**Tests:** 36/36 passing

---

### Phase 2 Complete: Recent Changes Panel

Created UI for tracking what changed recently:

**New component:** `web/src/components/RecentChanges.tsx`
- Shows recently modified functions grouped by file
- Relative timestamps ("2m ago", "just now")
- Click function to navigate to node
- "View Execution Flow" button to jump to entry point
- Empty state when no recent changes

**App.tsx updates:**
- Added view mode tabs in header (Recent | Graph)
- Toggle between RecentChanges and Graph views
- Keyboard hints updated (1/2 for views)

**CSS additions:**
- `.view-tabs` and `.view-tab` styling
- `.recent-changes` panel with file groups
- Empty state design

**Tests:** 36/36 passing

---

### Phase 1 Complete: Change Tracking Foundation

Wired up existing hook infrastructure to frontend:

**Backend (`src/types/index.ts`, `src/analyzer/pipeline.ts`):**
- Added `lastModified?: number` to GraphNode type
- Pipeline sets timestamp when nodes created/updated

**Frontend store (`web/src/lib/store.ts`):**
- Added `RecentChange` interface
- Added `recentChanges` array to track file changes
- Added `recordChange(change)` action with deduplication
- Added `getRecentlyModifiedNodes(withinMs)` selector

**WebSocket (`web/src/lib/websocket.ts`):**
- Process `'change'` message type
- Call `recordChange` with file path and timestamp

**NodeDetails (`web/src/components/NodeDetails.tsx`):**
- Added `formatTimeAgo()` helper
- Show "Modified X ago" badge in header

**Tests:** 36/36 passing

---

### Phase 5 P0 + Cleanup Complete

Polish and refinements for better UX:

**Keyboard shortcuts:**
- F = focus mode, Esc = clear selection, / = search
- +/- = zoom, Backspace = navigate back

**Interactions:**
- Hover states (brightness 1.2 on nodes)
- Double-click to focus on node
- Selected node pulse animation (2s glow)
- Right-click context menu (focus, callers, callees, copy)

**Empty/Loading states:**
- Empty state with icon + tips
- Loading skeleton while connecting/analyzing
- Error boundaries for crash recovery

**Quality of life:**
- Clickable file paths (filter by segment)
- Session persistence (localStorage)
- Copyable signature button

**Cleanup (11 items):**
- Hide labels at low zoom (<40%)
- Fade edges at low zoom (0-30% hidden)
- Remove redundant M/F/C badge (color is enough)
- Collapsible legend
- Simplified keyboard hints
- Visual separators in sidebar
- Compact line format (L210-223)
- Increased sidebar font (14px)
- Hover tooltips on graph nodes
- Clearer focus button state
- Copyable signature

**Tests:** 36/36 passing

---

### Source Citations Complete

Added JSDoc/docstring descriptions and code previews:

**Backend (`src/types/index.ts`):**
- Added `sourcePreview?: string` - first 5 lines of body
- Added `description?: string` - JSDoc/docstring text
- Added `category?: string` - inferred from file path

**TypeScript extractor:**
- Extract function body preview
- Extract JSDoc description from comments
- Category inference (/hooks/ → "Hooks", /components/ → "Components")

**Python extractor:**
- Extract function body preview
- Extract docstring descriptions

**Frontend:**
- Updated GraphNode type with new fields
- NodeDetails: Description section
- NodeDetails: Source preview section
- NodeDetails: Category badge in header

**Tests:** 36/36 passing

---

### Flow Explorer Complete

Reorganized NodeDetails into flow-oriented view:

**Store additions (`web/src/lib/store.ts`):**
- `getCallChainTo(nodeId)` - traces call path from entry to selected node
- Uses BFS to find shortest paths from entry points

**NodeDetails restructure:**
- **How We Get Here** - Call chain visualization with arrows (entry → ... → thisFunction)
- **What It Does** - Source code + signature + description
- **Where It Goes** - Callees with descriptions
- Properties section collapsed by default

**Conceptual shift:**
- Node-centric → Flow-centric view
- User can see: how we get here, what it does, where we go

---

### Phase 4.5 Complete: UX Improvements

Major improvements to visualization and interaction:

**Layout Fix - Component-Based Grid:**
- Problem: dagre placed 92 of 174 nodes at same Y=20, producing 37:1 aspect ratio (24,300 x 650px)
- Solution: Complete rewrite of `web/src/lib/dagre-layout.ts`
  - Union-find algorithm to detect connected components
  - Layout each component separately with dagre
  - Arrange components in grid (max 2000px width, then wrap)
- Position cache clear on each layout to prevent stale data

**WebSocket Stability Fix:**
- Problem: Connect/disconnect flapping every 3 seconds due to React StrictMode double-mount
- Solution: Updated `web/src/lib/websocket.ts`
  - Added heartbeat ping/pong every 25 seconds
  - Exponential backoff reconnection (1s → 30s max)
  - Reset `isConnectingRef` at effect start for StrictMode compatibility
  - Server-side ping/pong handler in `src/server/express.ts`

**New Features:**
- **Zoom controls** - +, -, fit-to-view, reset with percentage display (bottom-right)
- **Edge highlighting** - Green for callers, orange for calls on selection
- **Focus mode** - Show only N-level neighborhood (1-3 depth)
- **File grouping** - Colored background rectangles grouping nodes by file
- **Breadcrumb navigation** - History tracking with back/forward navigation
- **Legend** - Shows edge and node color meanings

**Files Modified:**
- `web/src/lib/dagre-layout.ts` - Complete rewrite
- `web/src/lib/websocket.ts` - Heartbeat + StrictMode fix
- `web/src/lib/store.ts` - Added navigation state (navigateToNode, navigateBack, clearHistory)
- `web/src/components/Graph.tsx` - Edge highlighting, focus mode, file groups, legend, zoom
- `web/src/components/Breadcrumbs.tsx` - New component
- `web/src/components/NodeDetails.tsx` - Use navigateToNode
- `web/src/App.tsx` - Added Breadcrumbs
- `web/src/App.css` - Extensive styling additions
- `src/server/express.ts` - Ping/pong handling

**Tests:** 36/36 passing

---

### Phase 4 Complete: Web UI

Built the interactive visualization UI:

**Files created:**
- `src/server/express.ts` — Express REST API + WebSocket server
- `src/server/index.ts` — Server module exports
- `src/index.ts` — CLI entry point (serve/analyze commands)
- `web/` — React frontend with Vite
  - `src/lib/store.ts` — Zustand state management
  - `src/lib/websocket.ts` — Real-time WebSocket connection
  - `src/lib/dagre-layout.ts` — Graph layout engine with caching
  - `src/components/Graph.tsx` — D3 interactive graph
  - `src/components/NodeDetails.tsx` — Selection details sidebar
  - `src/components/SearchBar.tsx` — Node search
  - `src/components/StatusBar.tsx` — Connection status

**Features:**
- REST API endpoints for graph queries
- WebSocket for real-time graph updates
- Interactive D3 graph with zoom/pan
- Click nodes to see callers/callees
- Search by function/class name
- Dark theme UI

**Tests:** 36/36 passing

---

### Phase 3 Complete: Change Detection

Built the real-time change detection system:

**Files created:**
- `src/hooks/adapter.ts` — Claude PostToolUse hook adapter
- `src/hooks/file-watcher.ts` — Chokidar file watcher (fallback)
- `src/hooks/change-aggregator.ts` — Debounced change aggregation + analysis trigger
- `src/hooks/change-detector.ts` — Unified change detection API
- `src/hooks/index.ts` — Module exports
- `scripts/claude-hook.sh` — Shell script for Claude hooks
- `test/hooks.test.ts` — 18 unit tests

**Features:**
- Claude PostToolUse hook integration (primary)
- File watcher fallback for non-Claude edits
- 500ms debounce to aggregate rapid changes
- Auto-triggers re-analysis when files change
- Session tracking for Claude interactions
- Privacy-conscious: content retention configurable
- Pattern-based ignore (node_modules, .git, etc.)

**Tests:** 36/36 passing (18 analyzer + 18 hooks)

---

### Python Support Added

Added Python parsing and extraction:

**Files created/modified:**
- `src/analyzer/extractor-python.ts` — Python-specific AST extraction
- `src/analyzer/tree-sitter.ts` — Added Python parser support
- `src/analyzer/extractor.ts` — Updated to dispatch by language
- `test/fixtures/python-project/` — auth.py, db.py, utils.py, __init__.py
- `test/analyzer.test.ts` — Added 5 Python-specific tests

**Python features:**
- Function/method extraction with type hints
- Class extraction
- Import extraction (import, from...import, aliased)
- Local call graph resolution
- `_` prefix convention for private functions

**Tests:** 18/18 passing (13 TS + 5 Python)

---

### Phase 1 Complete: Analysis Engine

Built the core tree-sitter analyzer:

**Files created:**
- `src/analyzer/tree-sitter.ts` — Parser wrapper for TS/JS
- `src/analyzer/extractor.ts` — Two-phase AST extraction (index first, resolve calls second)
- `src/analyzer/pipeline.ts` — Directory analysis orchestration
- `src/graph/graph.ts` — Graph data structure with query API
- `src/types/index.ts` — Core type definitions
- `test/analyzer.test.ts` — 13 unit tests
- `test/fixtures/sample-project/` — Test fixture files

**Key implementation decisions:**
- Two-phase extraction to handle forward references (function called before defined)
- Search prioritizes exact name matches over partial matches
- Exclude patterns escape regex special chars (`.test.` was matching `/test/` paths)

**Tests:** 13/13 passing

### Claude Hook Investigation

Confirmed Claude Code has production-ready hooks:
- `PostToolUse` — fires after Write/Edit with file_path, content
- `SessionStart` — session initialization
- `Stop` — session end

Hook input includes `session_id`, `transcript_path`, `tool_input` with full file data.

### Scope Clarification

User clarified priorities:
1. **Flow understanding** is the primary value (not change tracking)
2. **Real-time change detection** is the entry point to flow exploration
3. **Python support** needed eventually (user codes in Python normally)

Updated PLAN.md to reflect flow-first approach.

---

## 2026-01-10

### Project Setup

Project initialized from council plan.
