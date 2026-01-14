/**
 * Core types for CodeFlow Visualizer
 * Focus: Understanding code flow and relationships
 */

// ============================================
// Graph Nodes - Code elements
// ============================================

export type NodeKind = 'module' | 'function' | 'class' | 'method' | 'variable' | 'type';

export interface GraphNode {
  /** Unique ID: `${fileHash}:${kind}:${name}:${signatureHash}` */
  id: string;
  /** Stable ID for annotation lookup: `${fileHash}:${kind}:${name}` - survives signature changes */
  stableId: string;
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
  /** Hash of function body + params for staleness detection */
  contentHash?: string;
  /** AI-generated semantic annotation */
  annotation?: SemanticAnnotation;
}

// ============================================
// Semantic Annotations
// ============================================

export interface SemanticAnnotation {
  /** AI-generated purpose explanation (1-3 sentences) */
  text: string;
  /** Hash of function body when annotation was created */
  contentHash: string;
  /** Timestamp when annotation was generated (ms since epoch) */
  generatedAt: number;
  /** Source of the annotation */
  source: 'claude' | 'manual';
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

// ============================================
// Annotation Version History
// ============================================

export interface AnnotationVersion {
  /** Database ID */
  id: number;
  /** Node this annotation belongs to */
  nodeId: string;
  /** Stable ID for lookup (survives signature changes) */
  stableId: string;
  /** Hash of content when annotation was created */
  contentHash: string;
  /** The annotation text */
  text: string;
  /** Source of the annotation */
  source: 'claude' | 'manual';
  /** When this version was created (ms since epoch) */
  createdAt: number;
  /** When this version was superseded (null if current) */
  supersededAt?: number;
  /** ID of the version that superseded this one */
  supersededBy?: number;
}

// ============================================
// Module-Level Annotations
// ============================================

export interface ModuleAnnotation {
  /** Database ID */
  id: number;
  /** Module path (directory path) */
  modulePath: string;
  /** AI-generated summary of module purpose */
  summary: string;
  /** Number of functions when summary was generated */
  functionCount: number;
  /** Content hashes of functions included in summary */
  contentHashes: string[];
  /** When this summary was created (ms since epoch) */
  createdAt: number;
  /** When this summary was superseded (null if current) */
  supersededAt?: number;
  /** Whether any function has changed since summary */
  isStale?: boolean;
}

export interface ExtendedModuleNode extends ModuleNode {
  /** Module-level annotation data */
  annotation?: {
    summary: string;
    functionsCovered: number;
    functionsTotal: number;
    generatedAt: number;
    stale: boolean;
  };
}

// ============================================
// Drift Detection
// ============================================

export type DriftType = 'implementation' | 'semantic' | 'unknown';
export type DriftSeverity = 'low' | 'medium' | 'high';

export interface DriftEvent {
  /** Database ID */
  id: number;
  /** Node that drifted */
  nodeId: string;
  /** Stable ID for lookup (survives signature changes) */
  stableId: string;
  /** Content hash before the change */
  oldContentHash: string;
  /** Content hash after the change */
  newContentHash: string;
  /** ID of annotation that was in place when drift occurred */
  oldAnnotationId?: number;
  /** When drift was detected (ms since epoch) */
  detectedAt: number;
  /** Type of drift detected */
  driftType: DriftType;
  /** Severity of the drift */
  severity: DriftSeverity;
  /** When drift was resolved (null if unresolved) */
  resolvedAt?: number;
  /** Resolution description */
  resolution?: string;
}

export interface DriftSummary {
  /** Total unresolved drift events */
  unresolvedCount: number;
  /** Drift by severity */
  bySeverity: Record<DriftSeverity, number>;
  /** Drift by type */
  byType: Record<DriftType, number>;
  /** Most recent drift events */
  recent: DriftEvent[];
}

// ============================================
// Observability Rules (Future)
// ============================================

export type RuleCondition = 'missing_annotation' | 'stale' | 'high_drift' | 'uncovered_module';
export type RuleAction = 'warn' | 'block' | 'auto_regenerate';

export interface ObservabilityRule {
  id: string;
  name: string;
  condition: RuleCondition;
  threshold?: number;
  action: RuleAction;
  enabled: boolean;
}
