/**
 * Core Graph Data Structure
 * Stores nodes (functions, classes, modules) and edges (calls, imports)
 * Provides efficient query operations for flow exploration
 */

import type {
  GraphNode,
  GraphEdge,
  NodeKind,
  EdgeType,
  CallChain,
  CallTreeNode,
  ModuleNode,
  ModuleEdge,
  ModuleGraph,
} from '../types/index.js';

// ============================================
// Graph Class
// ============================================

export class CodeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();

  // Indexes for fast queries
  private nodesByFile = new Map<string, Set<string>>();
  private nodesByKind = new Map<NodeKind, Set<string>>();
  private nodesByName = new Map<string, Set<string>>();

  // Edge indexes
  private outgoingEdges = new Map<string, Set<string>>(); // nodeId -> edgeIds
  private incomingEdges = new Map<string, Set<string>>(); // nodeId -> edgeIds
  private edgesByType = new Map<EdgeType, Set<string>>();

  // ----------------------------------------
  // Node Operations
  // ----------------------------------------

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);

    // Index by file
    if (!this.nodesByFile.has(node.filePath)) {
      this.nodesByFile.set(node.filePath, new Set());
    }
    this.nodesByFile.get(node.filePath)!.add(node.id);

    // Index by kind
    if (!this.nodesByKind.has(node.kind)) {
      this.nodesByKind.set(node.kind, new Set());
    }
    this.nodesByKind.get(node.kind)!.add(node.id);

    // Index by name (for search)
    const lowerName = node.name.toLowerCase();
    if (!this.nodesByName.has(lowerName)) {
      this.nodesByName.set(lowerName, new Set());
    }
    this.nodesByName.get(lowerName)!.add(node.id);
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodeByStableId(stableId: string): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.stableId === stableId) {
        return node;
      }
    }
    return undefined;
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from indexes
    this.nodesByFile.get(node.filePath)?.delete(nodeId);
    this.nodesByKind.get(node.kind)?.delete(nodeId);
    this.nodesByName.get(node.name.toLowerCase())?.delete(nodeId);

    // Remove associated edges
    const outgoing = this.outgoingEdges.get(nodeId) ?? new Set();
    const incoming = this.incomingEdges.get(nodeId) ?? new Set();

    for (const edgeId of [...outgoing, ...incoming]) {
      this.removeEdge(edgeId);
    }

    this.nodes.delete(nodeId);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  // ----------------------------------------
  // Edge Operations
  // ----------------------------------------

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);

    // Index outgoing
    if (!this.outgoingEdges.has(edge.source)) {
      this.outgoingEdges.set(edge.source, new Set());
    }
    this.outgoingEdges.get(edge.source)!.add(edge.id);

    // Index incoming
    if (!this.incomingEdges.has(edge.target)) {
      this.incomingEdges.set(edge.target, new Set());
    }
    this.incomingEdges.get(edge.target)!.add(edge.id);

    // Index by type
    if (!this.edgesByType.has(edge.type)) {
      this.edgesByType.set(edge.type, new Set());
    }
    this.edgesByType.get(edge.type)!.add(edge.id);
  }

  getEdge(edgeId: string): GraphEdge | undefined {
    return this.edges.get(edgeId);
  }

  removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;

    this.outgoingEdges.get(edge.source)?.delete(edgeId);
    this.incomingEdges.get(edge.target)?.delete(edgeId);
    this.edgesByType.get(edge.type)?.delete(edgeId);
    this.edges.delete(edgeId);
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  // ----------------------------------------
  // Query: By File
  // ----------------------------------------

  getFileNodes(filePath: string): GraphNode[] {
    const nodeIds = this.nodesByFile.get(filePath) ?? new Set();
    return Array.from(nodeIds)
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  getFilePaths(): string[] {
    return Array.from(this.nodesByFile.keys());
  }

  // ----------------------------------------
  // Query: By Kind
  // ----------------------------------------

  getNodesByKind(kind: NodeKind): GraphNode[] {
    const nodeIds = this.nodesByKind.get(kind) ?? new Set();
    return Array.from(nodeIds)
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  // ----------------------------------------
  // Query: Search by Name
  // ----------------------------------------

  searchNodes(pattern: string): GraphNode[] {
    const lowerPattern = pattern.toLowerCase();
    const exactMatches: GraphNode[] = [];
    const partialMatches: GraphNode[] = [];

    for (const [name, nodeIds] of this.nodesByName) {
      if (name === lowerPattern) {
        // Exact match - highest priority
        for (const id of nodeIds) {
          const node = this.nodes.get(id);
          if (node) exactMatches.push(node);
        }
      } else if (name.includes(lowerPattern)) {
        // Partial match
        for (const id of nodeIds) {
          const node = this.nodes.get(id);
          if (node) partialMatches.push(node);
        }
      }
    }

    // Return exact matches first, then partial matches
    return [...exactMatches, ...partialMatches];
  }

  // ----------------------------------------
  // Query: Callers (who calls this function?)
  // ----------------------------------------

  findCallers(nodeId: string): GraphNode[] {
    const edgeIds = this.incomingEdges.get(nodeId) ?? new Set();
    const callers: GraphNode[] = [];

    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && (edge.type === 'calls' || edge.type === 'instantiates')) {
        const caller = this.nodes.get(edge.source);
        if (caller) callers.push(caller);
      }
    }

    return callers;
  }

  // ----------------------------------------
  // Query: Callees (what does this function call?)
  // ----------------------------------------

  findCallees(nodeId: string): GraphNode[] {
    const edgeIds = this.outgoingEdges.get(nodeId) ?? new Set();
    const callees: GraphNode[] = [];

    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && (edge.type === 'calls' || edge.type === 'instantiates')) {
        const callee = this.nodes.get(edge.target);
        if (callee) callees.push(callee);
      }
    }

    return callees;
  }

  // ----------------------------------------
  // Query: Call Chain (trace calls from a function)
  // ----------------------------------------

  getCallChain(nodeId: string, maxDepth: number = 5): CallChain {
    const chain: CallChain['chain'] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string, depth: number): void => {
      if (depth >= maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const edgeIds = this.outgoingEdges.get(currentId) ?? new Set();

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.type !== 'calls') continue;

        chain.push({
          caller: currentId,
          callee: edge.target,
          callSite: edge.callSite ?? { line: 0, col: 0 },
        });

        traverse(edge.target, depth + 1);
      }
    };

    traverse(nodeId, 0);

    return {
      root: nodeId,
      chain,
      depth: maxDepth,
    };
  }

  // ----------------------------------------
  // Query: Reverse Call Chain (trace callers up)
  // ----------------------------------------

  getReverseCallChain(nodeId: string, maxDepth: number = 5): CallChain {
    const chain: CallChain['chain'] = [];
    const visited = new Set<string>();

    const traverse = (currentId: string, depth: number): void => {
      if (depth >= maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const edgeIds = this.incomingEdges.get(currentId) ?? new Set();

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.type !== 'calls') continue;

        chain.push({
          caller: edge.source,
          callee: currentId,
          callSite: edge.callSite ?? { line: 0, col: 0 },
        });

        traverse(edge.source, depth + 1);
      }
    };

    traverse(nodeId, 0);

    return {
      root: nodeId,
      chain,
      depth: maxDepth,
    };
  }

  // ----------------------------------------
  // Query: Transitive Callers (all functions that depend on this)
  // ----------------------------------------

  getTransitiveCallers(nodeId: string, maxDepth: number = 3): {
    callers: GraphNode[];
    byDepth: Map<number, GraphNode[]>;
    total: number;
    exportedCount: number;
  } {
    const callers: GraphNode[] = [];
    const byDepth = new Map<number, GraphNode[]>();
    const visited = new Set<string>();
    let exportedCount = 0;

    const traverse = (currentId: string, depth: number): void => {
      if (depth > maxDepth) return;

      const edgeIds = this.incomingEdges.get(currentId) ?? new Set();

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.type !== 'calls') continue;

        if (visited.has(edge.source)) continue;
        visited.add(edge.source);

        const caller = this.nodes.get(edge.source);
        if (caller) {
          callers.push(caller);
          if (caller.exported) exportedCount++;

          // Group by depth
          const depthCallers = byDepth.get(depth) ?? [];
          depthCallers.push(caller);
          byDepth.set(depth, depthCallers);

          // Recurse to find indirect callers
          traverse(edge.source, depth + 1);
        }
      }
    };

    traverse(nodeId, 1);

    return {
      callers,
      byDepth,
      total: callers.length,
      exportedCount,
    };
  }

  // ----------------------------------------
  // Query: Call Tree (nested structure for walkthrough)
  // ----------------------------------------

  getCallTree(nodeId: string, maxDepth: number = 5, recentThresholdMs: number = 5 * 60 * 1000): CallTreeNode | null {
    const rootNode = this.nodes.get(nodeId);
    if (!rootNode) return null;

    const now = Date.now();
    const visited = new Set<string>();

    const buildTree = (currentId: string, depth: number): CallTreeNode | null => {
      if (depth > maxDepth || visited.has(currentId)) {
        // For visited nodes at this depth, return a leaf (no children) to avoid cycles
        const node = this.nodes.get(currentId);
        if (!node || visited.has(currentId)) return null;
        return {
          node,
          children: [],
          depth,
          isRecentlyModified: node.lastModified ? (now - node.lastModified) < recentThresholdMs : false,
        };
      }

      const node = this.nodes.get(currentId);
      if (!node) return null;

      visited.add(currentId);

      // Get callees (what this function calls)
      const edgeIds = this.outgoingEdges.get(currentId) ?? new Set();
      const children: CallTreeNode[] = [];

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge || (edge.type !== 'calls' && edge.type !== 'instantiates')) continue;

        const childTree = buildTree(edge.target, depth + 1);
        if (childTree) {
          children.push(childTree);
        }
      }

      // Sort children by line number of call site for execution order
      children.sort((a, b) => {
        const aLine = a.node.location.startLine;
        const bLine = b.node.location.startLine;
        return aLine - bLine;
      });

      return {
        node,
        children,
        depth,
        isRecentlyModified: node.lastModified ? (now - node.lastModified) < recentThresholdMs : false,
      };
    };

    return buildTree(nodeId, 0);
  }

  // ----------------------------------------
  // Query: Module Dependencies
  // ----------------------------------------

  getModuleDeps(filePath: string): { imports: string[]; importedBy: string[] } {
    const moduleNodes = this.getFileNodes(filePath).filter(n => n.kind === 'module');
    if (moduleNodes.length === 0) {
      return { imports: [], importedBy: [] };
    }

    const moduleId = moduleNodes[0].id;
    const imports: string[] = [];
    const importedBy: string[] = [];

    // Outgoing imports
    const outEdges = this.outgoingEdges.get(moduleId) ?? new Set();
    for (const edgeId of outEdges) {
      const edge = this.edges.get(edgeId);
      if (edge?.type === 'imports' && edge.label) {
        imports.push(edge.label);
      }
    }

    // Incoming (who imports this module)
    const inEdges = this.incomingEdges.get(moduleId) ?? new Set();
    for (const edgeId of inEdges) {
      const edge = this.edges.get(edgeId);
      if (edge?.type === 'imports') {
        const sourceNode = this.nodes.get(edge.source);
        if (sourceNode) {
          importedBy.push(sourceNode.filePath);
        }
      }
    }

    return { imports, importedBy };
  }

  // ----------------------------------------
  // Query: Edges by Type
  // ----------------------------------------

  getEdgesByType(type: EdgeType): GraphEdge[] {
    const edgeIds = this.edgesByType.get(type) ?? new Set();
    return Array.from(edgeIds)
      .map(id => this.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  // ----------------------------------------
  // Query: Neighborhood (k-hop)
  // ----------------------------------------

  getNeighborhood(nodeId: string, hops: number = 2): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const nodeIds = new Set<string>([nodeId]);
    const edgeIds = new Set<string>();

    let frontier = new Set<string>([nodeId]);

    for (let i = 0; i < hops; i++) {
      const nextFrontier = new Set<string>();

      for (const currentId of frontier) {
        // Outgoing
        const outEdges = this.outgoingEdges.get(currentId) ?? new Set();
        for (const edgeId of outEdges) {
          const edge = this.edges.get(edgeId);
          if (edge) {
            edgeIds.add(edgeId);
            if (!nodeIds.has(edge.target)) {
              nodeIds.add(edge.target);
              nextFrontier.add(edge.target);
            }
          }
        }

        // Incoming
        const inEdges = this.incomingEdges.get(currentId) ?? new Set();
        for (const edgeId of inEdges) {
          const edge = this.edges.get(edgeId);
          if (edge) {
            edgeIds.add(edgeId);
            if (!nodeIds.has(edge.source)) {
              nodeIds.add(edge.source);
              nextFrontier.add(edge.source);
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return {
      nodes: Array.from(nodeIds)
        .map(id => this.nodes.get(id))
        .filter((n): n is GraphNode => n !== undefined),
      edges: Array.from(edgeIds)
        .map(id => this.edges.get(id))
        .filter((e): e is GraphEdge => e !== undefined),
    };
  }

  // ----------------------------------------
  // Stats
  // ----------------------------------------

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    functionCount: number;
    classCount: number;
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      fileCount: this.nodesByFile.size,
      functionCount: (this.nodesByKind.get('function')?.size ?? 0) +
                    (this.nodesByKind.get('method')?.size ?? 0),
      classCount: this.nodesByKind.get('class')?.size ?? 0,
    };
  }

  // ----------------------------------------
  // Module Graph - Architecture level aggregation
  // ----------------------------------------

  getModuleGraph(recentThresholdMs: number = 5 * 60 * 1000): ModuleGraph {
    const now = Date.now();
    const moduleMap = new Map<string, {
      files: Set<string>;
      functionCount: number;
      exportedCount: number;
      lastModified?: number;
    }>();

    // Aggregate nodes by directory
    for (const node of this.nodes.values()) {
      // Extract directory from file path
      const lastSlash = node.filePath.lastIndexOf('/');
      const dir = lastSlash > 0 ? node.filePath.substring(0, lastSlash) : node.filePath;
      const fileName = lastSlash > 0 ? node.filePath.substring(lastSlash + 1) : node.filePath;

      if (!moduleMap.has(dir)) {
        moduleMap.set(dir, {
          files: new Set(),
          functionCount: 0,
          exportedCount: 0,
          lastModified: undefined,
        });
      }

      const mod = moduleMap.get(dir)!;
      mod.files.add(fileName);

      // Count functions and methods
      if (node.kind === 'function' || node.kind === 'method') {
        mod.functionCount++;
        if (node.exported) {
          mod.exportedCount++;
        }
      }

      // Track most recent modification
      if (node.lastModified) {
        if (!mod.lastModified || node.lastModified > mod.lastModified) {
          mod.lastModified = node.lastModified;
        }
      }
    }

    // Build module nodes
    const modules: ModuleNode[] = [];
    for (const [path, data] of moduleMap) {
      const lastSlash = path.lastIndexOf('/');
      const name = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

      modules.push({
        id: path,
        name,
        path,
        files: Array.from(data.files).sort(),
        functionCount: data.functionCount,
        exportedCount: data.exportedCount,
        recentlyChanged: data.lastModified ? (now - data.lastModified) < recentThresholdMs : false,
        lastModified: data.lastModified,
      });
    }

    // Build edges based on imports between modules
    const edgeMap = new Map<string, { weight: number; importingFiles: Set<string> }>();

    for (const edge of this.edges.values()) {
      if (edge.type !== 'imports') continue;

      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      const sourceDir = sourceNode.filePath.substring(0, sourceNode.filePath.lastIndexOf('/'));
      const targetDir = targetNode.filePath.substring(0, targetNode.filePath.lastIndexOf('/'));

      // Skip self-edges (same module)
      if (sourceDir === targetDir) continue;

      const edgeKey = `${sourceDir}|${targetDir}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, { weight: 0, importingFiles: new Set() });
      }

      const e = edgeMap.get(edgeKey)!;
      e.weight++;
      e.importingFiles.add(sourceNode.filePath);
    }

    // Build module edges
    const edges: ModuleEdge[] = [];
    for (const [key, data] of edgeMap) {
      const [source, target] = key.split('|');
      edges.push({
        source,
        target,
        weight: data.weight,
        importingFiles: Array.from(data.importingFiles),
      });
    }

    // Sort modules by path for consistent ordering
    modules.sort((a, b) => a.path.localeCompare(b.path));

    return { modules, edges };
  }

  // ----------------------------------------
  // Serialization
  // ----------------------------------------

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  static fromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): CodeGraph {
    const graph = new CodeGraph();
    for (const node of data.nodes) {
      graph.addNode(node);
    }
    for (const edge of data.edges) {
      graph.addEdge(edge);
    }
    return graph;
  }

  // ----------------------------------------
  // Clear file (for re-analysis)
  // ----------------------------------------

  clearFile(filePath: string): void {
    const nodeIds = this.nodesByFile.get(filePath);
    if (!nodeIds) return;

    for (const nodeId of [...nodeIds]) {
      this.removeNode(nodeId);
    }

    this.nodesByFile.delete(filePath);
  }
}
