# CodeFlow Visualizer

Real-time semantic observability for AI-assisted coding. Track code changes, visualize call graphs, and maintain documentation that stays in sync with your code.

**Two ways to use it:**
- **For you:** Visual UI to understand what changed and how code connects
- **For Claude:** MCP tools so Claude can search functions, trace calls, and understand your codebase while coding

## Visual Tour

### 1. Architecture View
*Get the big picture of your codebase*

![Architecture View](docs/step1-architecture.png)

The Architecture view shows module dependencies as an interactive diagram. The left panel displays a file tree organized by module, letting you expand any file to see its functions. Click a function to see its details in the right panel including source preview, callers, and callees.

### 2. Changes View
*Track modifications in real-time*

![Changes View](docs/step2-changes.png)

The Changes view provides a live feed of file modifications with git-style diffs. Each change shows the file name, line counts (+added/-removed), timestamp, and which functions were affected. Click any entry to expand the full diff with syntax highlighting.

### 3. Walkthrough View
*Step through execution flow*

![Walkthrough View](docs/step3-walkthrough.png)

The Walkthrough view displays the call tree from any entry point. Starting from any function, you can see the complete execution flow with each step showing the function signature and what it does.

### 4. Graph View
*Visualize the complete call graph*

![Graph View](docs/step4-graph.png)

The Graph view renders all functions as an interactive node graph. Nodes are color-coded by file, and edges show call relationships including cross-file imports. Click any node to see callers, callees, and impact analysis.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/kylenewm/code-visualizer.git
cd code-visualizer
npm install

# Start (analyzes current directory)
npm run dev

# Or analyze a specific project
npm run dev /path/to/your/project
```

Open http://localhost:5173 in your browser.

## Key Features

| Feature | Description |
|---------|-------------|
| **Call Graph Analysis** | Tree-sitter parsing extracts functions, classes, and call relationships |
| **Cross-File Resolution** | Resolves imports to actual function definitions across files |
| **Semantic Annotations** | Document what code *does*, not just what it *is* |
| **Drift Detection** | Alerts when code changes but documentation doesn't |
| **Auto-Annotate** | Automatically generate annotations for new/modified functions |
| **Real-Time Updates** | WebSocket pushes changes as you code |
| **Claude Integration** | 13 MCP tools + post-edit hook for AI-assisted workflows |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (React + D3)                      │
├─────────────────────────────────────────────────────────────────┤
│  REST API        │  WebSocket Events  │  MCP Tools (13)         │
├──────────────────┴───────────────────┴──────────────────────────┤
│                     Express Server                               │
├─────────────────────────────────────────────────────────────────┤
│  Change Detector  │  Analysis Pipeline  │  Rules Engine          │
│  (hooks + watcher)│  (tree-sitter)      │  (drift + blocks)      │
├──────────────────┴───────────────────┴──────────────────────────┤
│                     Graph Engine (graphlib)                      │
├─────────────────────────────────────────────────────────────────┤
│                     SQLite (annotations + history)               │
└─────────────────────────────────────────────────────────────────┘
```

**Key Technical Decisions:**
- **Tree-sitter** for fast, accurate AST parsing (TypeScript + Python)
- **SQLite** for persistence with full version history
- **Stable node IDs** survive file renames and refactors
- **Content hashing** detects changes without diffing source

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/graph` | Full call graph with nodes and edges |
| `GET /api/modules` | Module-level architecture summary |
| `GET /api/search?q=` | Search nodes by name or annotation |
| `GET /api/changes` | Recent changes with git diffs |
| `GET /api/annotations/:id` | Get annotation for a function |
| `POST /api/annotations` | Create/update annotation |
| `GET /api/touched` | Functions needing annotation review |
| `GET /api/auto-annotate` | Check auto-annotate status |
| `POST /api/auto-annotate` | Toggle auto-annotate on/off |
| `POST /api/rules/evaluate` | Evaluate rules against current state |
| `GET /api/snapshot` | Full semantic snapshot |

## MCP Tools (Claude Integration)

Give Claude deep understanding of your codebase. Instead of grepping through files, Claude can query the call graph directly:

| Tool | Purpose |
|------|---------|
| `search_functions` | Find functions by name pattern |
| `get_callers` | Find all functions that call a given function |
| `get_callees` | Find all functions called by a given function |
| `get_call_chain` | Trace execution flow from entry point |
| `get_file_functions` | List all functions in a file |
| `get_touched_functions` | Functions modified since last annotation |
| `annotate_function` | Add semantic annotation to a function |
| `get_stats` | Codebase statistics |

## Development

```bash
npm test              # Run tests (102 passing)
npm run typecheck     # Type check
npm run dev:web       # Frontend only (hot reload)
```

**Keyboard shortcuts:** `/` search, `1-4` switch views, `F` focus mode, `?` help

## Supported Languages

- TypeScript / JavaScript (full analysis + type resolution)
- Python (parsing + call extraction)


## Documentation

For a deep dive into how the system works, see the [System Walkthrough](docs/system-walkthrough.html).

## Requirements

- Node.js 18+
- npm 9+

## License

MIT
