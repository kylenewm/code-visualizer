/**
 * Dagre layout engine for graph visualization
 * Lays out connected components in a grid arrangement
 */

import dagre from 'dagre';
import type { GraphNode, GraphEdge } from './store';

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge extends GraphEdge {
  points: Array<{ x: number; y: number }>;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const MIN_NODE_WIDTH = 100;
const MAX_NODE_WIDTH = 220;
const NODE_HEIGHT = 40;
const CHAR_WIDTH = 8; // Approximate pixels per character

/** Calculate node width based on name length */
function getNodeWidth(name: string): number {
  const textWidth = name.length * CHAR_WIDTH + 24; // 24px padding
  return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, textWidth));
}

/**
 * Find connected components using union-find
 */
function findConnectedComponents(
  nodeIds: Set<string>,
  edges: Array<{ source: string; target: string }>
): string[][] {
  const parent = new Map<string, string>();

  for (const id of nodeIds) {
    parent.set(id, id);
  }

  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      union(edge.source, edge.target);
    }
  }

  const components = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    if (!components.has(root)) {
      components.set(root, []);
    }
    components.get(root)!.push(id);
  }

  // Sort by size descending (largest components first)
  return Array.from(components.values()).sort((a, b) => b.length - a.length);
}

/**
 * Layout a single connected component with dagre
 */
function layoutComponent(
  nodeIds: string[],
  nodeMap: Map<string, GraphNode>,
  edges: GraphEdge[]
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'TB',
    nodesep: 25,
    ranksep: 50,
    marginx: 20,
    marginy: 20,
    ranker: 'network-simplex',
  });

  g.setDefaultEdgeLabel(() => ({}));

  const nodeSet = new Set(nodeIds);

  const nodeWidths = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId)!;
    const width = getNodeWidth(node.name);
    nodeWidths.set(nodeId, width);
    g.setNode(nodeId, {
      label: node.name,
      width,
      height: NODE_HEIGHT,
    });
  }

  const componentEdges = edges.filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target)
  );

  for (const edge of componentEdges) {
    g.setEdge(edge.source, edge.target, { id: edge.id });
  }

  dagre.layout(g);

  const layoutNodes: LayoutNode[] = [];
  for (const nodeId of nodeIds) {
    const layoutNode = g.node(nodeId);
    const node = nodeMap.get(nodeId)!;
    layoutNodes.push({
      ...node,
      x: layoutNode.x,
      y: layoutNode.y,
      width: nodeWidths.get(nodeId) ?? MIN_NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  const layoutEdges: LayoutEdge[] = [];
  for (const edge of componentEdges) {
    const layoutEdge = g.edge(edge.source, edge.target);
    if (layoutEdge) {
      layoutEdges.push({
        ...edge,
        points: layoutEdge.points ?? [],
      });
    }
  }

  const graphInfo = g.graph();
  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: graphInfo.width ?? 200,
    height: graphInfo.height ?? 100,
  };
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  _options: {
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
    nodesep?: number;
    ranksep?: number;
  } = {}
): LayoutResult {
  // Filter to displayable nodes
  const graphNodes = nodes.filter(
    (n) => n.kind === 'function' || n.kind === 'method' || n.kind === 'class'
  );

  if (graphNodes.length === 0) {
    return { nodes: [], edges: [], width: 100, height: 100 };
  }

  const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  // Find connected components
  const components = findConnectedComponents(nodeIds, validEdges);

  // Layout each component and arrange in a grid
  const allNodes: LayoutNode[] = [];
  const allEdges: LayoutEdge[] = [];

  // Grid layout parameters
  const COMPONENT_GAP = 60;
  const MAX_ROW_WIDTH = 2000; // Max width before wrapping to new row

  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;
  let totalWidth = 0;
  let totalHeight = 0;

  for (const componentNodeIds of components) {
    // Layout this component
    const result = layoutComponent(componentNodeIds, nodeMap, validEdges);

    // Check if we need to wrap to a new row
    if (currentX > 0 && currentX + result.width > MAX_ROW_WIDTH) {
      currentX = 0;
      currentY += rowHeight + COMPONENT_GAP;
      rowHeight = 0;
    }

    // Offset all nodes and edge points by current position
    for (const node of result.nodes) {
      allNodes.push({
        ...node,
        x: node.x + currentX,
        y: node.y + currentY,
      });
    }

    for (const edge of result.edges) {
      allEdges.push({
        ...edge,
        points: edge.points.map((p) => ({
          x: p.x + currentX,
          y: p.y + currentY,
        })),
      });
    }

    // Update position for next component
    currentX += result.width + COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, result.height);
    totalWidth = Math.max(totalWidth, currentX);
    totalHeight = Math.max(totalHeight, currentY + result.height);
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    width: totalWidth + 40,
    height: totalHeight + 40,
  };
}

export function clearLayoutCache(): void {
  // No-op now, kept for API compatibility
}
