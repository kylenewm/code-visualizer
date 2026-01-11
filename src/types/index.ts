/**
 * Core types for CodeFlow Visualizer
 * Focus: Understanding code flow and relationships
 */

// ============================================
// Graph Nodes - Code elements
// ============================================

export type NodeKind = 'module' | 'function' | 'class' | 'method' | 'variable' | 'type';

export interface GraphNode {
  /** Stable ID: `${fileHash}:${kind}:${name}:${signatureHash}` */
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  /** Line numbers */
  location: { startLine: number; endLine: number; startCol: number; endCol: number };
  /** Function signature or variable type */
  signature?: string;
  /** Parameters for functions/methods */
  params?: Array<{ name: string; type?: string; description?: string }>;
  /** Return type for functions */
  returnType?: string;
  /** For classes: list of method names */
  methods?: string[];
  /** Parent node ID (e.g., method's class) */
  parentId?: string;
  /** Export status */
  exported: boolean;
  /** First 3-5 lines of function body (source citation) */
  sourcePreview?: string;
  /** JSDoc/docstring description */
  description?: string;
  /** Category inferred from file path (e.g., "Analysis", "Hooks", "Server") */
  category?: string;
  /** Timestamp when this node was last modified (ms since epoch) */
  lastModified?: number;
}

// ============================================
// Graph Edges - Relationships
// ============================================

export type EdgeType =
  | 'imports'      // Module imports another
  | 'calls'        // Function calls function
  | 'instantiates' // Code creates instance of class
  | 'extends'      // Class extends class
  | 'implements'   // Class implements interface
  | 'uses'         // Variable/type usage
  | 'returns'      // Function returns type/value
  | 'param_flow';  // Argument flows to parameter

export type EdgeConfidence = 'exact' | 'typechecked' | 'heuristic';

export interface GraphEdge {
  id: string;
  source: string;  // Node ID
  target: string;  // Node ID
  type: EdgeType;
  confidence: EdgeConfidence;
  /** For calls: the call site location */
  callSite?: { line: number; col: number };
  /** For param_flow: which param index */
  paramIndex?: number;
  /** Label for display */
  label?: string;
}

// ============================================
// Call Chain - For flow exploration
// ============================================

export interface CallChain {
  /** Starting function */
  root: string;  // Node ID
  /** Ordered list of calls from root */
  chain: Array<{
    caller: string;    // Node ID
    callee: string;    // Node ID
    callSite: { line: number; col: number };
  }>;
  /** Max depth explored */
  depth: number;
}

// ============================================
// Call Tree - Nested structure for walkthrough
// ============================================

export interface CallTreeNode {
  /** The graph node at this position */
  node: GraphNode;
  /** Functions called by this node */
  children: CallTreeNode[];
  /** Depth from root (0 = entry point) */
  depth: number;
  /** Whether this node was recently modified */
  isRecentlyModified?: boolean;
}

// ============================================
// Data Flow
// ============================================

export interface DataFlowPath {
  /** Where the data originates */
  source: {
    nodeId: string;
    type: 'param' | 'variable' | 'return' | 'literal';
    name: string;
  };
  /** Where the data ends up */
  sink: {
    nodeId: string;
    type: 'param' | 'variable' | 'return' | 'assignment';
    name: string;
  };
  /** Intermediate steps */
  path: Array<{
    nodeId: string;
    transformation: string;  // e.g., "passed as arg 0", "returned", "assigned to x"
  }>;
}

// ============================================
// Analysis Result
// ============================================

export interface AnalysisResult {
  /** Files that were analyzed */
  files: string[];
  /** All nodes found */
  nodes: GraphNode[];
  /** All edges found */
  edges: GraphEdge[];
  /** Analysis timing */
  timing: {
    startMs: number;
    endMs: number;
    parseMs: number;
    graphMs: number;
  };
  /** Any errors during analysis */
  errors: Array<{
    file: string;
    message: string;
    line?: number;
  }>;
}

// ============================================
// Graph Query API
// ============================================

export interface GraphQuery {
  /** Find all callers of a function */
  findCallers(nodeId: string): GraphNode[];

  /** Find all functions called by a function */
  findCallees(nodeId: string): GraphNode[];

  /** Get full call chain from a function (up to depth) */
  getCallChain(nodeId: string, depth: number): CallChain;

  /** Find all nodes in a file */
  getFileNodes(filePath: string): GraphNode[];

  /** Find nodes by name pattern */
  searchNodes(pattern: string): GraphNode[];

  /** Get imports/dependencies of a module */
  getModuleDeps(filePath: string): GraphNode[];

  /** Get modules that depend on this one */
  getModuleDependents(filePath: string): GraphNode[];
}

// ============================================
// Module Graph - Architecture level view
// ============================================

export interface ModuleNode {
  /** Module path (directory path, e.g., "src/analyzer") */
  id: string;
  /** Display name (last segment, e.g., "analyzer") */
  name: string;
  /** Full directory path */
  path: string;
  /** Files in this module */
  files: string[];
  /** Total function count in module */
  functionCount: number;
  /** Exported function count */
  exportedCount: number;
  /** Whether any file in module was recently changed */
  recentlyChanged: boolean;
  /** Timestamp of most recent change in module */
  lastModified?: number;
}

export interface ModuleEdge {
  /** Source module path */
  source: string;
  /** Target module path */
  target: string;
  /** Number of imports from source to target */
  weight: number;
  /** Which files have imports */
  importingFiles: string[];
}

export interface ModuleGraph {
  modules: ModuleNode[];
  edges: ModuleEdge[];
}

// ============================================
// Hook Events (secondary - triggers analysis)
// ============================================

export interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string;
  timestamp: number;
  source: 'claude_hook' | 'fs_watch' | 'manual';
}
