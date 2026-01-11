#!/usr/bin/env node
/**
 * CodeFlow Visualizer - Main Entry Point
 * Provides CLI for starting the analysis server
 */

import { resolve } from 'path';
import { analyzeProject } from './analyzer/pipeline.js';
import { createChangeDetector } from './hooks/index.js';
import { ApiServer } from './server/index.js';

// ============================================
// CLI Arguments
// ============================================

interface CliArgs {
  command: 'serve' | 'analyze' | 'help';
  projectDir: string;
  port: number;
  watch: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    command: 'serve',
    projectDir: process.cwd(),
    port: 3001,
    watch: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'serve' || arg === 'analyze' || arg === 'help') {
      result.command = arg;
    } else if (arg === '--port' || arg === '-p') {
      result.port = parseInt(args[++i]) || 3001;
    } else if (arg === '--no-watch') {
      result.watch = false;
    } else if (arg === '--help' || arg === '-h') {
      result.command = 'help';
    } else if (!arg.startsWith('-')) {
      result.projectDir = resolve(arg);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
CodeFlow Visualizer - Real-time code flow visualization

Usage: codeflow [command] [options] [project-dir]

Commands:
  serve     Start the visualization server (default)
  analyze   Analyze project and print stats
  help      Show this help message

Options:
  -p, --port <port>   Server port (default: 3001)
  --no-watch          Disable file watching
  -h, --help          Show help

Examples:
  codeflow                    Start server for current directory
  codeflow serve ./my-project Start server for specific project
  codeflow analyze ./src      Analyze and print stats
  codeflow -p 8080            Start server on port 8080
`);
}

// ============================================
// Commands
// ============================================

async function runAnalyze(projectDir: string): Promise<void> {
  console.log(`Analyzing ${projectDir}...`);

  const startTime = Date.now();
  const { graph, result } = await analyzeProject(projectDir);
  const duration = Date.now() - startTime;

  const stats = graph.getStats();

  console.log(`
Analysis complete in ${duration}ms

Files: ${result.files.length}
Nodes: ${stats.nodeCount}
  - Functions: ${stats.functionCount}
  - Classes: ${stats.classCount}
  - Modules: ${stats.fileCount}
Edges: ${stats.edgeCount}

Errors: ${result.errors.length}
${result.errors.map(e => `  ${e.file}: ${e.message}`).join('\n')}
`);
}

async function runServe(projectDir: string, port: number, watch: boolean): Promise<void> {
  console.log(`Starting CodeFlow Visualizer...`);
  console.log(`Project: ${projectDir}`);

  // Initial analysis
  console.log('Performing initial analysis...');
  const { graph, result } = await analyzeProject(projectDir);
  console.log(`Analyzed ${result.files.length} files, found ${graph.getStats().functionCount} functions`);

  // Start server
  const server = new ApiServer({ port });
  server.setGraph(graph);

  // Set up change detection
  if (watch) {
    const detector = createChangeDetector(projectDir, graph);
    server.setChangeDetector(detector);

    detector.on('analysis:complete', (analysisResult) => {
      console.log(`Re-analyzed ${analysisResult.analyzedFiles.length} files in ${analysisResult.durationMs}ms`);
    });

    await detector.start();
    console.log('File watching enabled');
  }

  await server.start();
  console.log(`
CodeFlow Visualizer running!

API: http://localhost:${port}/api
WebSocket: ws://localhost:${port}

Endpoints:
  GET /api/graph          - Full graph
  GET /api/search?q=      - Search nodes
  GET /api/nodes/:id      - Node details
  GET /api/nodes/:id/callers  - Who calls this
  GET /api/nodes/:id/callees  - What this calls
  GET /api/nodes/:id/chain    - Call chain
  GET /api/nodes/:id/neighborhood - Nearby nodes
  GET /api/files          - List files
  GET /api/stats          - Statistics

Press Ctrl+C to stop
`);
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = parseArgs();

  switch (args.command) {
    case 'help':
      printHelp();
      break;

    case 'analyze':
      await runAnalyze(args.projectDir);
      break;

    case 'serve':
      await runServe(args.projectDir, args.port, args.watch);
      break;
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
