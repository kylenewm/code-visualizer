# STATE.md

## Current Phase
**v2: Architecture-First Visualization**

## v2 Goal
Replace 135-node function graph with module-level architecture view (5-15 boxes) + change feed with diffs + hierarchical drill-down.

## v2 Complete
- [x] Phase 1: Module-level architecture view
- [x] Phase 2: Change feed with git diffs
- [x] Phase 3: Hierarchical drill-down
- [x] Phase 4: Polish

---

## Post-v2: Graph View Improvements
- [x] File group visibility fix
  - Bright distinct colors per file (blue, green, amber, red, purple, cyan, orange, pink)
  - Colored strokes and file name labels
  - Node borders colored by file
  - Updated legend with file colors
- [x] Dynamic node width
  - Nodes now size based on function name length (100-220px)
  - Prevents truncation for longer function names
- [x] Source preview expand/collapse
  - Increased preview from 5 to 12 lines
  - Added "Show more"/"Show less" button in Walkthrough view
  - Default collapsed view shows 5 lines, expanded shows all 12

## Known Issue
- File group rectangles overlap when nodes from different files are positioned nearby
- Root cause: Layout is by call graph connectivity, not by file
- Would need layout-by-file-first approach to fully fix
- Very long function names (>25 chars) still truncated at MAX_NODE_WIDTH=220px

---

## v2 Recently Completed (Phase 4: Polish)
- [x] Persist expansion state to localStorage
  - Saves expanded modules/files across page refreshes
  - Added `setExpandedModules` and `setExpandedFiles` actions to store
- [x] Back to Architecture button in Walkthrough view
  - Added `requestView` action to store for navigation
  - Styled button in header with arrow
- [x] View transition animations
  - Smooth fade-slide animation when switching views
- [x] Expand All / Collapse All buttons in Architecture view
  - Quick way to expand or collapse entire tree
- [x] All tests pass (65/65)

---

## v2 Recently Completed (Phase 3: Hierarchical Drill-Down)
- [x] Added drill-down state to store (`web/src/lib/store.ts`)
  - `drillDownEntryId` - Entry point for walkthrough when drilling down
  - `requestedView` - View to switch to when drill-down is triggered
- [x] Added drill-down actions to store
  - `drillDownToWalkthrough(nodeId)` - Sets entry and requests view switch
  - `clearDrillDown()` - Clears the drill-down entry
  - `clearRequestedView()` - Clears the requested view
- [x] Updated ArchitectureView to use drill-down
  - Clicking a function drills down to Walkthrough view with that function as entry
- [x] Updated ChangeFeed to use drill-down
  - Clicking an affected function drills down to Walkthrough view
- [x] Updated App.tsx to respond to requestedView changes
  - useEffect watches for requestedView and switches view mode
- [x] Updated CallTreeView to accept drill-down entry
  - useEffect watches for drillDownEntryId and sets selected entry
  - Auto-expands first level when drilling down
- [x] All tests pass (65/65)

---

## v2 Recently Completed (Phase 2: Change Feed with Git Diffs)
- [x] Added `ChangeEvent` type with diff information
  - filePath, fileName, timestamp, type (create/modify/delete)
  - diff (git diff output), summary, affectedFunctions
  - linesAdded, linesRemoved
- [x] Added git diff capture to change aggregator
  - Runs `git diff HEAD -- <file>` on change detection
  - Extracts lines added/removed counts
  - Extracts affected function names from diff context
- [x] Added change history to ChangeAggregator and ChangeDetector
  - `getChangeHistory(limit?)` returns recent changes with diffs
  - `getChangeEvent(id)` returns specific change by ID
- [x] Added REST API endpoints
  - `GET /api/changes` - List recent changes with diffs
  - `GET /api/changes/:id` - Get specific change by ID
- [x] Added WebSocket `change:recorded` event for real-time updates
- [x] Created `ChangeFeed.tsx` component with:
  - Change cards with type badge (NEW/MOD/DEL)
  - File name, lines added/removed summary
  - Expandable git diff view with syntax highlighting
  - Affected function buttons (click to navigate)
- [x] Replaced RecentChanges with ChangeFeed (tab renamed to "Changes")
- [x] Added CSS styling for change feed and diff display
- [x] All tests pass (65/65)

---

## v2 Recently Completed (Phase 1: Module-level Architecture View)
- [x] Added `ModuleNode`, `ModuleEdge`, `ModuleGraph` types to backend (src/types/index.ts)
- [x] Added `getModuleGraph()` method to graph engine
  - Aggregates nodes by directory
  - Tracks function counts, exported counts, recent changes per module
  - Builds edges based on imports between modules
- [x] Added `/api/modules` REST endpoint
- [x] Added module graph state to frontend store
  - `moduleGraph`, `expandedModules`, `expandedFiles` state
  - `setModuleGraph`, `toggleModuleExpanded`, `toggleFileExpanded` actions
- [x] Created `ArchitectureView.tsx` component with:
  - Module cards with expand/collapse
  - File rows with function counts
  - Function list with kind indicators
  - CHANGED badges for recently modified modules/files/functions
  - Dependencies section showing module-to-module imports
- [x] Updated App.tsx:
  - Added "Architecture" as default view (replaces Graph as primary)
  - Four-tab layout: Architecture | Recent | Walkthrough | Graph
- [x] Added CSS styling for architecture view
- [x] All tests pass (65/65)

---

## v1 Completed (Foundation)
- [x] Claude hook investigation — hooks available and well-documented
- [x] Updated PLAN.md with flow-first approach
- [x] Project scaffold: package.json, tsconfig.json, folder structure
- [x] Core types defined (src/types/index.ts)
- [x] Tree-sitter parser wrapper (src/analyzer/tree-sitter.ts)
- [x] AST extractor with two-phase approach (src/analyzer/extractor.ts)
- [x] Graph engine with query API (src/graph/graph.ts)
- [x] Analysis pipeline (src/analyzer/pipeline.ts)
- [x] Unit tests passing (36/36)
- [x] **Python support added** — tree-sitter-python + Python extractor
- [x] Python test fixtures + tests
- [x] **Phase 3: Change Detection complete**
  - [x] Claude PostToolUse hook adapter
  - [x] File watcher with chokidar (fallback)
  - [x] Change aggregator with debounce + analysis trigger
  - [x] Change detector (unified API)
- [x] **Phase 4: Web UI complete**
  - [x] Express server with REST API
  - [x] WebSocket for real-time graph updates
  - [x] React frontend with Vite
  - [x] D3/dagre graph visualization
  - [x] Node details sidebar
  - [x] Search and status bar
- [x] **Phase 4.5: UX Improvements**
  - [x] Fixed layout (component-based grid arrangement)
  - [x] WebSocket stability (heartbeat + exponential backoff)
  - [x] Zoom controls (+, -, fit, reset with percentage display)
  - [x] Edge highlighting on node selection (green=callers, orange=calls)
  - [x] Focus mode (show only N-level neighborhood)
  - [x] Visual file grouping (background rectangles + labels)
  - [x] Breadcrumb navigation trail (history tracking)
  - [x] Legend showing edge/node color meanings

## In Progress
None

## Recently Completed (Test Harness)
- [x] Created e2e fixture project (`test/fixtures/e2e-project/app.ts`)
  - Single-file app with known call graph
  - Expected results in `expected.json`
- [x] Integration tests (`test/e2e.test.ts`) - 16 tests
  - Node extraction verification
  - Call graph edge verification
  - Call tree building
  - Entry point detection
  - Search functionality
  - Neighborhood queries
  - Statistics validation
- [x] API endpoint tests (`test/api.test.ts`) - 13 tests
  - Health check
  - Stats, graph, search endpoints
  - Node callers/callees/chain/neighborhood
  - File listing
- [x] Playwright UI tests (`test/ui/app.spec.ts`) - 13 tests
  - App loading
  - View switching (Recent/Walkthrough/Graph)
  - All components visible
  - Node details sidebar
- [x] **Total: 78 tests (65 vitest + 13 playwright)**

## Recently Completed (Phase 3: Call Tree Walkthrough View)
- [x] Added `CallTreeNode` type to backend (src/types/index.ts)
- [x] Added `getCallTree(nodeId, depth)` method to graph engine
- [x] Added `getCallTree` and `getEntryPoints` selectors to frontend store
- [x] Created `CallTreeView.tsx` component with:
  - Entry point selector (auto-detects recent/exported functions)
  - Nested tree structure with collapsible nodes
  - Inline source code preview at each step
  - [CHANGED] badges on recently modified nodes
  - Depth control slider (1-10 levels)
  - Expand All / Collapse All buttons
- [x] Added "Walkthrough" tab to App.tsx (Recent | Walkthrough | Graph)
- [x] CSS styling for tree view
- [x] All tests pass (36/36)

## Recently Completed (Phase 2: Recent Changes Panel)
- [x] Created `RecentChanges.tsx` component
- [x] Shows recently modified functions grouped by file
- [x] "View Execution Flow" button to jump to entry point
- [x] Added view mode tabs (Recent | Graph) in header
- [x] CSS styling for the panel and tabs
- [x] All tests pass (36/36)

## Recently Completed (Phase 1: Change Tracking Foundation)
- [x] Added `lastModified` field to GraphNode type (backend + frontend)
- [x] Pipeline sets timestamp when nodes created/updated
- [x] Store tracks `recentChanges` with deduplication
- [x] WebSocket processes change events and records them
- [x] NodeDetails shows "Modified X ago" badge
- [x] All tests pass (36/36)

## Recently Completed (Flow Explorer)
- [x] `getCallChainTo` function in store - traces call path from entry to selected node
- [x] Reorganized NodeDetails into flow-oriented view:
  - **How We Get Here** - Shows call chain with clickable nodes
  - **What It Does** - Source code + signature + description
  - **Where It Goes** - Callees with descriptions
- [x] Call chain visualization with arrows (entryPoint → ... → thisFunction)
- [x] Properties section collapsed by default
- [x] Better styling for flow sections

## Recently Completed (Source Citations)
- [x] Backend: Added `sourcePreview`, `description`, `category` fields to GraphNode type
- [x] TypeScript extractor: Extracts first 5 lines of function body
- [x] TypeScript extractor: Extracts JSDoc description from comments
- [x] Python extractor: Extracts function body preview
- [x] Python extractor: Extracts docstring descriptions
- [x] Category inference from file paths (e.g., "/hooks/" → "Hooks")
- [x] Frontend: Updated GraphNode type with new fields
- [x] NodeDetails: Added Description section (JSDoc/docstring)
- [x] NodeDetails: Added Source Preview section (code snippet)
- [x] NodeDetails: Added category badge in header
- [x] CSS styling for new sections

## Recently Completed (Phase 5 P0 + Cleanup)
- [x] Keyboard shortcuts (F=focus, Esc=clear, /=search, +/-=zoom, Backspace=back)
- [x] Hover states (brightness 1.2 on nodes)
- [x] Double-click to focus on node
- [x] Selected node pulse animation (2s glow animation)
- [x] Context menu on right-click (focus, callers, callees, copy name/path)
- [x] Error boundaries for crash recovery
- [x] Empty state design (icon + tips)
- [x] Loading skeleton states (spinner while connecting/analyzing)
- [x] Clickable file paths (click path segment to filter)
- [x] Session persistence (localStorage saves selection/search)

**Cleanup & Clarity (11 items):**
- [x] Hide labels at low zoom (<40%) - clean colored blocks overview
- [x] Fade edges at low zoom (0-30% hidden, gradual fade)
- [x] Remove redundant M/F/C badge on nodes (color is enough)
- [x] Collapsible legend (click to expand/collapse)
- [x] Simplified keyboard hints (just /search, F focus, ? more)
- [x] Visual separators between sidebar sections
- [x] Compact line format (L210-223 instead of "Lines 210 - 223")
- [x] Increased sidebar font size (14px)
- [x] Hover tooltips on graph nodes (name + kind + caller/callee counts)
- [x] Clearer focus button state ("Show All" vs "Focus")
- [x] Copyable signature with button

## Working Features
- Parse TypeScript/JavaScript/Python files with tree-sitter
- Extract functions, classes, methods, imports (TS/JS/Python)
- Extract call sites and resolve local calls
- Build call graph with edges
- Query API: findCallers, findCallees, getCallChain, getCallTree, getNeighborhood, searchNodes
- Analyze directory of files (supports mixed language projects)
- **Real-time visualization** with D3/dagre
- **Interactive exploration** with edge highlighting and focus mode
- **Navigation tracking** with breadcrumbs
- **Source citations** - JSDoc/docstring descriptions + code previews
- **Category inference** - file path-based categorization (Hooks, Components, Server, etc.)
- **Change tracking** - lastModified timestamps, recent changes panel
- **Walkthrough view** - nested call tree from entry point with inline source

## Known Limitations
- Cross-file call resolution not yet implemented (Phase 2 skipped)
- No export functionality (PNG/SVG/JSON)

## Next Up (Priority Order)
1. [ ] Minimap for large graphs
2. [ ] Export functionality (PNG/SVG/JSON)
3. [ ] Cross-file call resolution (Phase 2)

## Blockers
None.

## Key Decisions
| Decision | Why |
|----------|-----|
| Flow understanding is primary value | User needs to understand how code connects |
| Two-phase extraction | Index all declarations first, then resolve calls |
| Exact match priority in search | Prevents module names from matching function searches |
| Skip Phase 2 for now | User wants change detection before semantic resolution |
| Python support added early | User codes in Python normally |
| Component-based layout | Prevents flat horizontal line when many disconnected nodes |
| Focus mode over multi-select | Simpler mental model for exploration |
