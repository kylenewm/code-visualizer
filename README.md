# CodeFlow Visualizer

Real-time code visualization for understanding how your codebase connects. Designed for use with AI coding assistants like Claude Code.

## Features

- **Architecture View** - Module-level overview with drill-down to files and functions
- **Change Feed** - See what changed with git diffs
- **Walkthrough View** - Step through execution flow from any entry point
- **Graph View** - Interactive call graph with file groupings
- **Real-time Updates** - WebSocket-powered live updates as code changes

## Quick Start

```bash
# Install dependencies
npm install

# Start the server (analyzes current directory by default)
npm run dev

# Or analyze a specific project
npm run dev -- --path /path/to/your/project
```

Then open http://localhost:5173 in your browser.

## Requirements

- Node.js 18+
- npm 9+

## How It Works

1. **Parser** - Uses tree-sitter to parse TypeScript/JavaScript and Python files
2. **Extractor** - Extracts functions, classes, imports, and call sites
3. **Graph Engine** - Builds a call graph with edges between functions
4. **File Watcher** - Detects changes and re-analyzes affected files
5. **Web UI** - React frontend with D3 visualization

## Project Structure

```
src/
  analyzer/       # Tree-sitter parsing and extraction
  graph/          # Call graph engine
  hooks/          # Change detection (Claude hooks + file watcher)
  server/         # Express API + WebSocket server
web/
  src/
    components/   # React components (Graph, Architecture, etc.)
    lib/          # State management, layout engine
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/graph | Full call graph |
| GET /api/modules | Module-level architecture |
| GET /api/search?q= | Search nodes by name |
| GET /api/nodes/:id | Node details |
| GET /api/nodes/:id/callers | Who calls this function |
| GET /api/nodes/:id/callees | What this function calls |
| GET /api/changes | Recent changes with diffs |

## Development

```bash
# Run tests
npm test

# Run with watch mode
npm run test:watch

# Type check
npm run typecheck
```

## Supported Languages

- TypeScript / JavaScript
- Python

## License

MIT
