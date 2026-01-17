/**
 * Analysis Pipeline
 * Orchestrates parsing and graph building
 */

import { readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { parseFile, parseSource, inferLanguage } from './tree-sitter.js';
import { extractFromAST, resolveLocalCalls, type ExtractionResult, type UnresolvedCall } from './extractor.js';
import { CodeGraph } from '../graph/graph.js';
import type { AnalysisResult, GraphNode, GraphEdge } from '../types/index.js';

// ============================================
// Pipeline Configuration
// ============================================

export interface PipelineConfig {
  /** File patterns to include (glob-like) */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Max file size to analyze (bytes) */
  maxFileSize?: number;
  /** Timeout per file (ms) */
  timeoutPerFile?: number;
}

const DEFAULT_CONFIG: Required<PipelineConfig> = {
  include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
  maxFileSize: 1024 * 1024, // 1MB
  timeoutPerFile: 100, // 100ms target
};

// ============================================
// Pipeline Class
// ============================================

export class AnalysisPipeline {
  private graph: CodeGraph;
  private config: Required<PipelineConfig>;

  // Cross-file resolution data
  private moduleToFile = new Map<string, string>();  // moduleName -> filePath
  private fileToFunctionIndex = new Map<string, Map<string, string>>();  // filePath -> (funcName -> nodeId)
  private pendingCrossFileCalls: Array<UnresolvedCall & { sourceFile: string }> = [];

  constructor(config: PipelineConfig = {}) {
    this.graph = new CodeGraph();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ----------------------------------------
  // Analyze Single File
  // ----------------------------------------

  async analyzeFile(filePath: string): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    parseTimeMs: number;
    extractTimeMs: number;
  }> {
    const startParse = performance.now();
    const parseResult = await parseFile(filePath);
    const parseTimeMs = performance.now() - startParse;

    const startExtract = performance.now();
    const extraction = extractFromAST(parseResult.tree.rootNode, filePath);
    const { resolved, stillUnresolved } = resolveLocalCalls(extraction);
    const extractTimeMs = performance.now() - startExtract;

    // Store cross-file resolution data
    const moduleName = basename(filePath).replace(/\.[^.]+$/, '');
    this.moduleToFile.set(moduleName, filePath);

    // Store function index for this file (only non-import entries)
    const localFunctions = new Map<string, string>();
    for (const [name, id] of extraction.functionIndex) {
      if (!id.startsWith('import:')) {
        localFunctions.set(name, id);
      }
    }
    this.fileToFunctionIndex.set(filePath, localFunctions);

    // Collect unresolved calls that reference imports (for cross-file resolution)
    for (const call of stillUnresolved) {
      const targetRef = extraction.functionIndex.get(call.calleeName);
      if (targetRef?.startsWith('import:')) {
        this.pendingCrossFileCalls.push({ ...call, sourceFile: filePath });
      }
    }

    // Add to graph (without lastModified - only change-aggregator sets that on re-analysis)
    for (const node of extraction.nodes) {
      this.graph.addNode(node);
    }
    for (const edge of [...extraction.edges, ...resolved]) {
      this.graph.addEdge(edge);
    }

    return {
      nodes: extraction.nodes,
      edges: [...extraction.edges, ...resolved],
      parseTimeMs,
      extractTimeMs,
    };
  }

  // ----------------------------------------
  // Analyze Source String
  // ----------------------------------------

  analyzeSource(source: string, filePath: string): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const parseResult = parseSource(source, filePath);
    const extraction = extractFromAST(parseResult.tree.rootNode, filePath);
    const { resolved } = resolveLocalCalls(extraction);

    // Clear old data for this file and add new
    this.graph.clearFile(filePath);

    for (const node of extraction.nodes) {
      this.graph.addNode(node);
    }
    for (const edge of [...extraction.edges, ...resolved]) {
      this.graph.addEdge(edge);
    }

    return {
      nodes: extraction.nodes,
      edges: [...extraction.edges, ...resolved],
    };
  }

  // ----------------------------------------
  // Analyze Directory
  // ----------------------------------------

  async analyzeDirectory(dirPath: string): Promise<AnalysisResult> {
    const startMs = performance.now();
    const files = await this.findFiles(dirPath);

    // Reset cross-file resolution state
    this.moduleToFile.clear();
    this.fileToFunctionIndex.clear();
    this.pendingCrossFileCalls = [];

    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    const errors: AnalysisResult['errors'] = [];
    let totalParseMs = 0;

    for (const file of files) {
      try {
        const result = await this.analyzeFile(file);
        allNodes.push(...result.nodes);
        allEdges.push(...result.edges);
        totalParseMs += result.parseTimeMs;
      } catch (err) {
        errors.push({
          file,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Resolve cross-file calls after all files are analyzed
    const crossFileEdges = this.resolveCrossFileCalls(dirPath);
    allEdges.push(...crossFileEdges);
    for (const edge of crossFileEdges) {
      this.graph.addEdge(edge);
    }

    const endMs = performance.now();

    return {
      files,
      nodes: allNodes,
      edges: allEdges,
      timing: {
        startMs,
        endMs,
        parseMs: totalParseMs,
        graphMs: endMs - startMs - totalParseMs,
      },
      errors,
    };
  }

  // ----------------------------------------
  // Cross-File Call Resolution
  // ----------------------------------------

  private resolveCrossFileCalls(projectRoot: string): GraphEdge[] {
    const resolvedEdges: GraphEdge[] = [];

    for (const call of this.pendingCrossFileCalls) {
      // The call.calleeName is the function being called (e.g., "draw_box")
      // We need to find which module it was imported from

      // Get the function index for the source file to find the import reference
      const sourceDir = dirname(call.sourceFile);

      // Try to resolve the module - check common patterns
      // For Python: "from shapes import draw_box" means look for shapes.py in same dir
      for (const [moduleName, targetFile] of this.moduleToFile) {
        // Check if target file is in the same directory or a subdirectory
        const targetDir = dirname(targetFile);

        // Simple heuristic: same directory or relative path match
        if (targetDir === sourceDir || targetFile.startsWith(sourceDir)) {
          const targetFunctions = this.fileToFunctionIndex.get(targetFile);
          if (targetFunctions?.has(call.calleeName)) {
            const targetNodeId = targetFunctions.get(call.calleeName)!;

            // Create edge
            const edgeId = `${call.callerNodeId}->${targetNodeId}:calls:xfile`;
            resolvedEdges.push({
              id: edgeId,
              source: call.callerNodeId,
              target: targetNodeId,
              type: 'calls',
              confidence: 'heuristic',  // Cross-file resolution is heuristic
              callSite: call.callSite,
            });
            break;  // Found a match, stop looking
          }
        }
      }
    }

    return resolvedEdges;
  }

  // ----------------------------------------
  // Re-analyze Changed Files
  // ----------------------------------------

  async reanalyzeFiles(filePaths: string[]): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }> {
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];

    for (const filePath of filePaths) {
      // Clear old data
      this.graph.clearFile(filePath);

      // Re-analyze
      const result = await this.analyzeFile(filePath);
      allNodes.push(...result.nodes);
      allEdges.push(...result.edges);
    }

    return { nodes: allNodes, edges: allEdges };
  }

  // ----------------------------------------
  // Get Graph
  // ----------------------------------------

  getGraph(): CodeGraph {
    return this.graph;
  }

  // ----------------------------------------
  // Find Files
  // ----------------------------------------

  private async findFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Check exclude patterns
          if (this.shouldExclude(fullPath)) continue;
          await walk(fullPath);
        } else if (entry.isFile()) {
          // Check if it's a supported file
          const lang = inferLanguage(fullPath);
          if (!lang) continue;

          // Check exclude patterns
          if (this.shouldExclude(fullPath)) continue;

          // Check file size
          const stats = await stat(fullPath);
          if (stats.size > this.config.maxFileSize) continue;

          files.push(fullPath);
        }
      }
    };

    await walk(dirPath);
    return files;
  }

  private shouldExclude(path: string): boolean {
    for (const pattern of this.config.exclude) {
      // Simple pattern matching
      if (pattern.includes('**') || pattern.includes('*')) {
        // Escape regex special chars except * which we handle specially
        const regex = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars
          .replace(/\*\*/g, '.*')                  // ** matches anything
          .replace(/\*/g, '[^/]*');                // * matches non-slash
        if (new RegExp(regex).test(path)) {
          return true;
        }
      } else if (path.includes(pattern)) {
        return true;
      }
    }
    return false;
  }
}

// ============================================
// Convenience Functions
// ============================================

export async function analyzeProject(
  dirPath: string,
  config?: PipelineConfig
): Promise<{ graph: CodeGraph; result: AnalysisResult }> {
  const pipeline = new AnalysisPipeline(config);
  const result = await pipeline.analyzeDirectory(dirPath);
  return { graph: pipeline.getGraph(), result };
}

export function analyzeSourceCode(
  source: string,
  filePath: string
): { graph: CodeGraph; nodes: GraphNode[]; edges: GraphEdge[] } {
  const pipeline = new AnalysisPipeline();
  const { nodes, edges } = pipeline.analyzeSource(source, filePath);
  return { graph: pipeline.getGraph(), nodes, edges };
}
