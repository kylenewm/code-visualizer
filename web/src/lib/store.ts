/**
 * Zustand store for graph state management
 */

import { create } from 'zustand';

export interface GraphNode {
  id: string;
  kind: 'function' | 'method' | 'class' | 'module';
  name: string;
  filePath: string;
  location: {
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
  };
  signature?: string;
  exported?: boolean;
  /** First 3-5 lines of function body */
  sourcePreview?: string;
  /** JSDoc/docstring description */
  description?: string;
  /** Category inferred from file path */
  category?: string;
  /** Timestamp when this node was last modified */
  lastModified?: number;
}

export interface RecentChange {
  filePath: string;
  timestamp: number;
  type: 'create' | 'modify' | 'delete';
}

/** Nested call tree structure for walkthrough view */
export interface CallTreeNode {
  node: GraphNode;
  children: CallTreeNode[];
  depth: number;
  isRecentlyModified?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'calls' | 'imports' | 'instantiates';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Module-level architecture types
export interface ModuleNode {
  id: string;
  name: string;
  path: string;
  files: string[];
  functionCount: number;
  exportedCount: number;
  recentlyChanged: boolean;
  lastModified?: number;
}

export interface ModuleEdge {
  source: string;
  target: string;
  weight: number;
  importingFiles: string[];
}

export interface ModuleGraph {
  modules: ModuleNode[];
  edges: ModuleEdge[];
}

// Change event with git diff
export interface ChangeEvent {
  id: string;
  filePath: string;
  fileName: string;
  timestamp: number;
  type: 'create' | 'modify' | 'delete';
  source: 'claude_hook' | 'fs_watcher' | 'mixed';
  diff?: string;
  summary?: string;
  affectedFunctions: string[];
  linesAdded: number;
  linesRemoved: number;
}

interface GraphStore {
  // Data
  nodes: GraphNode[];
  edges: GraphEdge[];
  recentChanges: RecentChange[];
  changeEvents: ChangeEvent[];
  moduleGraph: ModuleGraph | null;

  // UI State
  selectedNodeId: string | null;
  selectedModuleId: string | null;
  expandedModules: Set<string>;
  expandedFiles: Set<string>;
  searchQuery: string;
  isConnected: boolean;
  isAnalyzing: boolean;
  navigationHistory: string[]; // Breadcrumb trail

  // Drill-down state
  drillDownEntryId: string | null; // Entry point for walkthrough when drilling down
  requestedView: 'architecture' | 'recent' | 'walkthrough' | 'graph' | null;

  // Actions
  setGraph: (data: GraphData) => void;
  setSelectedNode: (nodeId: string | null) => void;
  navigateToNode: (nodeId: string) => void; // Adds to history
  navigateBack: () => void;
  clearHistory: () => void;
  setSearchQuery: (query: string) => void;
  setConnected: (connected: boolean) => void;
  setAnalyzing: (analyzing: boolean) => void;
  recordChange: (change: RecentChange) => void;

  // Module graph actions
  setModuleGraph: (graph: ModuleGraph) => void;
  selectModule: (moduleId: string | null) => void;
  toggleModuleExpanded: (moduleId: string) => void;
  toggleFileExpanded: (filePath: string) => void;
  setExpandedModules: (modules: Set<string>) => void;
  setExpandedFiles: (files: Set<string>) => void;
  getFilesInModule: (moduleId: string) => string[];
  getNodesInFile: (filePath: string) => GraphNode[];

  // Change event actions
  addChangeEvent: (event: ChangeEvent) => void;
  setChangeEvents: (events: ChangeEvent[]) => void;
  getChangeEvents: (limit?: number) => ChangeEvent[];

  // Drill-down actions
  drillDownToWalkthrough: (nodeId: string) => void;
  requestView: (view: 'architecture' | 'recent' | 'walkthrough' | 'graph') => void;
  clearDrillDown: () => void;
  clearRequestedView: () => void;

  // Computed
  getNode: (id: string) => GraphNode | undefined;
  getNodesByKind: (kind: GraphNode['kind']) => GraphNode[];
  getFilteredNodes: () => GraphNode[];
  getCallers: (nodeId: string) => GraphNode[];
  getCallees: (nodeId: string) => GraphNode[];
  /** Get reverse call chain - how we get to this node (up to depth) */
  getCallChainTo: (nodeId: string, maxDepth?: number) => GraphNode[][];
  /** Get nodes that were recently modified */
  getRecentlyModifiedNodes: (withinMs?: number) => GraphNode[];
  /** Get call tree (nested structure) from a node */
  getCallTree: (nodeId: string, maxDepth?: number) => CallTreeNode | null;
  /** Get entry points (exported functions with no callers) */
  getEntryPoints: () => GraphNode[];
  /** Get all callers transitively - impact analysis */
  getImpact: (nodeId: string, maxDepth?: number) => { callers: GraphNode[]; depth: Map<string, number> };
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  recentChanges: [],
  changeEvents: [],
  moduleGraph: null,
  selectedNodeId: null,
  selectedModuleId: null,
  expandedModules: new Set<string>(),
  expandedFiles: new Set<string>(),
  searchQuery: '',
  isConnected: false,
  isAnalyzing: false,
  navigationHistory: [],
  drillDownEntryId: null,
  requestedView: null,

  // Actions
  setGraph: (data) => set({ nodes: data.nodes, edges: data.edges }),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  navigateToNode: (nodeId) => {
    const { selectedNodeId, navigationHistory } = get();
    // Don't add duplicates or if navigating to current
    if (nodeId === selectedNodeId) return;

    const newHistory = selectedNodeId
      ? [...navigationHistory.slice(-9), selectedNodeId] // Keep last 10
      : navigationHistory;

    set({ selectedNodeId: nodeId, navigationHistory: newHistory });
  },

  navigateBack: () => {
    const { navigationHistory } = get();
    if (navigationHistory.length === 0) return;

    const newHistory = [...navigationHistory];
    const previousNode = newHistory.pop();

    set({ selectedNodeId: previousNode ?? null, navigationHistory: newHistory });
  },

  clearHistory: () => set({ navigationHistory: [], selectedNodeId: null }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setConnected: (connected) => set({ isConnected: connected }),

  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

  recordChange: (change) => {
    const { recentChanges } = get();
    // Keep last 50 changes, most recent first
    const updated = [change, ...recentChanges.filter(c => c.filePath !== change.filePath)].slice(0, 50);
    set({ recentChanges: updated });
  },

  // Module graph actions
  setModuleGraph: (graph) => set({ moduleGraph: graph }),

  selectModule: (moduleId) => set({ selectedModuleId: moduleId }),

  toggleModuleExpanded: (moduleId) => {
    const { expandedModules } = get();
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    set({ expandedModules: newExpanded });
  },

  toggleFileExpanded: (filePath) => {
    const { expandedFiles } = get();
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    set({ expandedFiles: newExpanded });
  },

  setExpandedModules: (modules) => set({ expandedModules: modules }),

  setExpandedFiles: (files) => set({ expandedFiles: files }),

  getFilesInModule: (moduleId) => {
    const { moduleGraph } = get();
    const module = moduleGraph?.modules.find(m => m.id === moduleId);
    return module?.files ?? [];
  },

  getNodesInFile: (filePath) => {
    const { nodes } = get();
    return nodes.filter(n => n.filePath === filePath);
  },

  // Change event actions
  addChangeEvent: (event) => {
    const { changeEvents } = get();
    // Add to front, dedupe by id, limit to 100
    const filtered = changeEvents.filter(e => e.id !== event.id);
    set({ changeEvents: [event, ...filtered].slice(0, 100) });
  },

  setChangeEvents: (events) => set({ changeEvents: events }),

  getChangeEvents: (limit) => {
    const { changeEvents } = get();
    return limit ? changeEvents.slice(0, limit) : changeEvents;
  },

  // Drill-down actions
  drillDownToWalkthrough: (nodeId) => {
    set({
      drillDownEntryId: nodeId,
      requestedView: 'walkthrough',
      selectedNodeId: nodeId,
    });
  },

  requestView: (view) => {
    set({ requestedView: view });
  },

  clearDrillDown: () => {
    set({ drillDownEntryId: null });
  },

  clearRequestedView: () => {
    set({ requestedView: null });
  },

  // Computed
  getNode: (id) => get().nodes.find((n) => n.id === id),

  getNodesByKind: (kind) => get().nodes.filter((n) => n.kind === kind),

  getFilteredNodes: () => {
    const { nodes, searchQuery } = get();
    if (!searchQuery) return nodes;

    const query = searchQuery.toLowerCase();
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(query) ||
        n.filePath.toLowerCase().includes(query)
    );
  },

  getCallers: (nodeId) => {
    const { nodes, edges } = get();
    const callerIds = edges
      .filter((e) => e.target === nodeId && (e.type === 'calls' || e.type === 'instantiates'))
      .map((e) => e.source);
    return nodes.filter((n) => callerIds.includes(n.id));
  },

  getCallees: (nodeId) => {
    const { nodes, edges } = get();
    const calleeIds = edges
      .filter((e) => e.source === nodeId && (e.type === 'calls' || e.type === 'instantiates'))
      .map((e) => e.target);
    return nodes.filter((n) => calleeIds.includes(n.id));
  },

  getCallChainTo: (nodeId, maxDepth = 5) => {
    const { nodes, edges } = get();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const paths: GraphNode[][] = [];

    // BFS to find all paths to this node (reversed - from callers back)
    const queue: { path: string[]; current: string }[] = [{ path: [nodeId], current: nodeId }];
    const visited = new Set<string>();

    while (queue.length > 0 && paths.length < 3) { // Limit to 3 paths
      const { path, current } = queue.shift()!;

      if (path.length > maxDepth + 1) continue;

      // Find callers of current node
      const callerIds = edges
        .filter(e => e.target === current && (e.type === 'calls' || e.type === 'instantiates'))
        .map(e => e.source);

      if (callerIds.length === 0 && path.length > 1) {
        // Reached an entry point - save this path (reversed)
        const nodePath = path.map(id => nodeMap.get(id)).filter((n): n is GraphNode => !!n);
        paths.push(nodePath.reverse());
      } else {
        for (const callerId of callerIds) {
          const pathKey = [...path, callerId].join('->');
          if (!visited.has(pathKey) && !path.includes(callerId)) {
            visited.add(pathKey);
            queue.push({ path: [...path, callerId], current: callerId });
          }
        }
      }
    }

    // If no complete paths found, return partial path from immediate callers
    if (paths.length === 0) {
      const node = nodeMap.get(nodeId);
      if (node) {
        paths.push([node]);
      }
    }

    return paths;
  },

  getRecentlyModifiedNodes: (withinMs = 5 * 60 * 1000) => {
    const { nodes } = get();
    const cutoff = Date.now() - withinMs;
    return nodes
      .filter(n => n.lastModified && n.lastModified > cutoff)
      .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  },

  getCallTree: (nodeId, maxDepth = 5) => {
    const { nodes, edges } = get();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const rootNode = nodeMap.get(nodeId);
    if (!rootNode) return null;

    const now = Date.now();
    const recentThresholdMs = 5 * 60 * 1000; // 5 minutes
    const visited = new Set<string>();

    const buildTree = (currentId: string, depth: number): CallTreeNode | null => {
      if (depth > maxDepth || visited.has(currentId)) return null;

      const node = nodeMap.get(currentId);
      if (!node) return null;

      visited.add(currentId);

      // Get callees
      const calleeIds = edges
        .filter(e => e.source === currentId && (e.type === 'calls' || e.type === 'instantiates'))
        .map(e => e.target);

      const children: CallTreeNode[] = [];
      for (const calleeId of calleeIds) {
        const childTree = buildTree(calleeId, depth + 1);
        if (childTree) {
          children.push(childTree);
        }
      }

      // Sort children by their location (approximate execution order)
      children.sort((a, b) => a.node.location.startLine - b.node.location.startLine);

      return {
        node,
        children,
        depth,
        isRecentlyModified: node.lastModified ? (now - node.lastModified) < recentThresholdMs : false,
      };
    };

    return buildTree(nodeId, 0);
  },

  getEntryPoints: () => {
    const { nodes, edges } = get();
    // Entry points are exported functions/methods that have no callers
    const calledNodeIds = new Set(
      edges
        .filter(e => e.type === 'calls' || e.type === 'instantiates')
        .map(e => e.target)
    );

    return nodes.filter(n =>
      (n.kind === 'function' || n.kind === 'method') &&
      n.exported &&
      !calledNodeIds.has(n.id)
    );
  },

  getImpact: (nodeId, maxDepth = 10) => {
    const { nodes, edges } = get();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Build reverse adjacency (who calls what)
    const callerMap = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.type === 'calls' || edge.type === 'instantiates') {
        if (!callerMap.has(edge.target)) {
          callerMap.set(edge.target, new Set());
        }
        callerMap.get(edge.target)!.add(edge.source);
      }
    }

    // BFS to find all transitive callers
    const visited = new Set<string>();
    const depthMap = new Map<string, number>();
    const queue: { id: string; depth: number }[] = [];

    // Start from direct callers
    const directCallers = callerMap.get(nodeId) || new Set();
    for (const callerId of directCallers) {
      queue.push({ id: callerId, depth: 1 });
    }

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);
      depthMap.set(id, depth);

      // Add this node's callers to queue
      const callers = callerMap.get(id) || new Set();
      for (const callerId of callers) {
        if (!visited.has(callerId)) {
          queue.push({ id: callerId, depth: depth + 1 });
        }
      }
    }

    // Convert to nodes
    const callers = Array.from(visited)
      .map(id => nodeMap.get(id))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => (depthMap.get(a.id) || 0) - (depthMap.get(b.id) || 0));

    return { callers, depth: depthMap };
  },
}));
