/**
 * Interactive Graph Visualization Component
 * Features: Edge highlighting, focus mode, file grouping, keyboard shortcuts
 */

import { useEffect, useRef, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '../lib/store';
import { layoutGraph, type LayoutNode, type LayoutEdge } from '../lib/dagre-layout';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

// Enterprise design colors - matching tokens.css
const COLORS: Record<string, string> = {
  // Node types (matches accent colors from tokens.css)
  function: '#3b82f6',      // --accent-blue
  method: '#8b5cf6',        // --accent-purple
  class: '#14b8a6',         // --accent-teal
  module: '#52525b',        // --text-muted

  // Selection and highlighting
  selected: '#f59e0b',      // --accent-amber
  selectedFill: '#78350f',  // Darker amber for selected node fill
  selectedStroke: '#fbbf24', // --accent-amber-hover

  // Edge colors
  edge: '#3f3f46',          // Softer edge color
  callEdge: '#3b82f6',      // --accent-blue
  importEdge: '#14b8a6',    // --accent-teal
  highlightEdge: '#f59e0b', // --accent-amber
  incomingEdge: '#22c55e',  // --accent-green (callers)
  outgoingEdge: '#f59e0b',  // --accent-amber (callees)

  // Node fill colors (darker for better contrast)
  functionFill: '#1e3a5f',
  methodFill: '#3b2a5f',
  classFill: '#1a3f3a',

  // Filter colors
  shadowColor: 'rgba(0, 0, 0, 0.4)',
  glowColor: 'rgba(245, 158, 11, 0.5)',

  // Text
  textPrimary: '#fafafa',   // --text-primary
};

// Expose methods to parent via ref
export interface GraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToScreen: () => void;
  toggleFocusMode: () => void;
  setFocusDepth: (depth: number) => void;
}

export const Graph = forwardRef<GraphHandle>(function Graph(_props, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [focusDepth, setFocusDepth] = useState(2);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [showChangedOnly, setShowChangedOnly] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const isConnected = useGraphStore((s) => s.isConnected);
  const isAnalyzing = useGraphStore((s) => s.isAnalyzing);

  // Get neighbors of selected node for focus mode
  const getNeighbors = useCallback((nodeId: string, depth: number): Set<string> => {
    const neighbors = new Set<string>([nodeId]);
    let frontier = new Set<string>([nodeId]);

    for (let i = 0; i < depth; i++) {
      const newFrontier = new Set<string>();
      for (const id of frontier) {
        // Find connected nodes
        for (const edge of edges) {
          if (edge.source === id && !neighbors.has(edge.target)) {
            neighbors.add(edge.target);
            newFrontier.add(edge.target);
          }
          if (edge.target === id && !neighbors.has(edge.source)) {
            neighbors.add(edge.source);
            newFrontier.add(edge.source);
          }
        }
      }
      frontier = newFrontier;
    }
    return neighbors;
  }, [edges]);

  // Get changed nodes (modified in last 5 minutes) and their direct neighbors
  const getChangedNodesWithNeighbors = useCallback((): Set<string> => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const changedIds = new Set<string>();

    // Find recently changed nodes
    for (const node of nodes) {
      if (node.lastModified && node.lastModified > fiveMinutesAgo) {
        changedIds.add(node.id);
      }
    }

    // If no changed nodes, return empty set
    if (changedIds.size === 0) return changedIds;

    // Add direct neighbors (1 level: callers and callees)
    const withNeighbors = new Set<string>(changedIds);
    for (const edge of edges) {
      if (changedIds.has(edge.source)) {
        withNeighbors.add(edge.target);
      }
      if (changedIds.has(edge.target)) {
        withNeighbors.add(edge.source);
      }
    }

    return withNeighbors;
  }, [nodes, edges]);

  // Count changed nodes for UI feedback
  const changedNodeCount = useMemo(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return nodes.filter(n => n.lastModified && n.lastModified > fiveMinutesAgo).length;
  }, [nodes]);

  // Track if we've auto-focused on changed nodes (prevent re-triggering)
  const hasAutoFocusedRef = useRef(false);

  // Auto-focus on changed code when entering Graph view with recent changes
  useEffect(() => {
    // Only auto-focus once when graph first loads with changed nodes
    if (!hasAutoFocusedRef.current && changedNodeCount > 0 && nodes.length > 0) {
      setShowChangedOnly(true);
      hasAutoFocusedRef.current = true;
    }
  }, [changedNodeCount, nodes.length]);

  // Filter and layout nodes
  const layout = useMemo(() => {
    let filteredNodes = nodes;
    let filteredEdges = edges;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredNodes = nodes.filter(
        (n) =>
          n.name.toLowerCase().includes(query) ||
          n.filePath.toLowerCase().includes(query)
      );
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
      );
    }

    // Show changed only mode: filter to changed nodes + direct neighbors
    if (showChangedOnly) {
      const changedWithNeighbors = getChangedNodesWithNeighbors();
      if (changedWithNeighbors.size > 0) {
        filteredNodes = filteredNodes.filter((n) => changedWithNeighbors.has(n.id));
        filteredEdges = filteredEdges.filter(
          (e) => changedWithNeighbors.has(e.source) && changedWithNeighbors.has(e.target)
        );
      }
    }

    // Focus mode: only show neighbors
    if (focusMode && selectedNodeId) {
      const neighbors = getNeighbors(selectedNodeId, focusDepth);
      filteredNodes = filteredNodes.filter((n) => neighbors.has(n.id));
      filteredEdges = filteredEdges.filter(
        (e) => neighbors.has(e.source) && neighbors.has(e.target)
      );
    }

    return layoutGraph(filteredNodes, filteredEdges, { rankdir: 'TB' });
  }, [nodes, edges, searchQuery, showChangedOnly, getChangedNodesWithNeighbors, focusMode, selectedNodeId, focusDepth, getNeighbors]);


  // Zoom controls
  const zoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.5);
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.67);
    }
  }, []);

  const resetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, []);

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scale = Math.min(
      (width - 80) / layout.width,
      (height - 80) / layout.height,
      2
    );
    const translateX = (width - layout.width * scale) / 2;
    const translateY = (height - layout.height * scale) / 2;

    svg.transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
      );
  }, [layout.width, layout.height]);

  // Toggle focus mode
  const toggleFocusMode = useCallback(() => {
    if (!selectedNodeId && !focusMode) {
      return; // Can't enable focus without selection
    }
    setFocusMode((prev) => !prev);
  }, [selectedNodeId, focusMode]);

  // Expose methods via ref for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    zoomIn,
    zoomOut,
    resetZoom,
    fitToScreen,
    toggleFocusMode,
    setFocusDepth,
  }), [zoomIn, zoomOut, resetZoom, fitToScreen, toggleFocusMode]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.selectAll('*').remove();

    // Zoom setup with responsive visibility
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        setCurrentZoom(k);

        // Zoom-responsive visibility
        // Hide labels below 20% zoom (was 40%)
        g.selectAll('.node-label').style('opacity', k >= 0.2 ? 1 : 0);

        // Fade edges at low zoom
        const edgeOpacity = k < 0.3 ? 0 : k < 0.5 ? 0.2 : k < 0.7 ? 0.4 : 0.6;
        g.selectAll('.edges path:not(.edge-highlight)').style('opacity', edgeOpacity);
        g.selectAll('.edges path.edge-highlight').style('opacity', 1);
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    const g = svg.append('g');

    // Defs for markers
    const defs = svg.append('defs');

    // Normal arrow
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', COLORS.edge);

    // Highlighted arrow
    defs.append('marker')
      .attr('id', 'arrowhead-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', COLORS.highlightEdge);

    // Import arrow (green)
    defs.append('marker')
      .attr('id', 'arrowhead-import')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', COLORS.importEdge);

    // Build file -> color mapping for group backgrounds and node borders
    const fileColorMap = new Map<string, string>();
    const fileColors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#f97316', // orange
      '#ec4899', // pink
    ];
    let fileColorIndex = 0;

    // Assign colors by file (node colors indicate file membership)
    for (const node of layout.nodes) {
      const fileName = node.filePath.split('/').pop() || 'unknown';
      if (!fileColorMap.has(fileName)) {
        fileColorMap.set(fileName, fileColors[fileColorIndex % fileColors.length]);
        fileColorIndex++;
      }
    }

    // Determine which edges are connected to selected node
    const connectedEdgeIds = new Set<string>();
    const incomingEdgeIds = new Set<string>();
    const outgoingEdgeIds = new Set<string>();

    if (selectedNodeId) {
      for (const edge of layout.edges) {
        if (edge.source === selectedNodeId) {
          connectedEdgeIds.add(edge.id);
          outgoingEdgeIds.add(edge.id);
        }
        if (edge.target === selectedNodeId) {
          connectedEdgeIds.add(edge.id);
          incomingEdgeIds.add(edge.id);
        }
      }
    }

    // Draw edges
    const edgeGroup = g.append('g').attr('class', 'edges');

    edgeGroup.selectAll('path')
      .data(layout.edges)
      .join('path')
      .attr('d', (d: LayoutEdge) => {
        if (d.points.length < 2) return '';
        const line = d3.line<{ x: number; y: number }>()
          .x((p) => p.x)
          .y((p) => p.y)
          .curve(d3.curveBasis);
        return line(d.points);
      })
      .attr('stroke', (d: LayoutEdge) => {
        if (connectedEdgeIds.has(d.id)) {
          return incomingEdgeIds.has(d.id) ? COLORS.incomingEdge : COLORS.outgoingEdge;
        }
        if (d.type === 'imports') return COLORS.importEdge;
        return COLORS.edge;
      })
      .attr('stroke-width', (d: LayoutEdge) =>
        connectedEdgeIds.has(d.id) ? 2.5 : 1.5
      )
      .attr('fill', 'none')
      .attr('marker-end', (d: LayoutEdge) => {
        if (connectedEdgeIds.has(d.id)) return 'url(#arrowhead-highlight)';
        if (d.type === 'imports') return 'url(#arrowhead-import)';
        return 'url(#arrowhead)';
      })
      .attr('opacity', (d: LayoutEdge) => {
        if (!selectedNodeId) return 0.5;
        return connectedEdgeIds.has(d.id) ? 1 : 0.15;
      })
      .attr('class', (d: LayoutEdge) =>
        connectedEdgeIds.has(d.id) ? 'edge-highlight' : 'edge-dim'
      );

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');

    // Determine connected nodes for highlighting
    const connectedNodeIds = new Set<string>();
    if (selectedNodeId) {
      connectedNodeIds.add(selectedNodeId);
      for (const edge of layout.edges) {
        if (edge.source === selectedNodeId) connectedNodeIds.add(edge.target);
        if (edge.target === selectedNodeId) connectedNodeIds.add(edge.source);
      }
    }

    const nodeElements = nodeGroup.selectAll('g')
      .data(layout.nodes)
      .join('g')
      .attr('transform', (d: LayoutNode) => `translate(${d.x - d.width / 2},${d.y - d.height / 2})`)
      .attr('cursor', 'pointer')
      .attr('class', (d: LayoutNode) => `graph-node ${d.id === selectedNodeId ? 'selected' : ''}`)
      .attr('opacity', (d: LayoutNode) => {
        if (!selectedNodeId) return 1;
        return connectedNodeIds.has(d.id) ? 1 : 0.3;
      })
      .on('click', (_event: MouseEvent, d: LayoutNode) => {
        if (d.id === selectedNodeId) {
          setSelectedNode(null);
        } else {
          navigateToNode(d.id);
        }
      })
      .on('dblclick', (_event: MouseEvent, d: LayoutNode) => {
        // Double-click to focus on node
        navigateToNode(d.id);
        setFocusMode(true);
      })
      .on('contextmenu', (event: MouseEvent, d: LayoutNode) => {
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          nodeId: d.id,
        });
      });

    // Drop shadow filter for nodes
    const shadowFilter = defs.append('filter')
      .attr('id', 'node-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');

    shadowFilter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('stdDeviation', 4)
      .attr('flood-color', COLORS.shadowColor);

    // Glow filter for selected nodes
    const glowFilter = defs.append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glowFilter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 0)
      .attr('stdDeviation', 8)
      .attr('flood-color', COLORS.glowColor);

    // Node background with improved styling
    nodeElements.append('rect')
      .attr('width', (d: LayoutNode) => d.width)
      .attr('height', (d: LayoutNode) => d.height)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d: LayoutNode) => {
        if (d.id === selectedNodeId) return COLORS.selectedFill;
        // Use kind-based fill colors for better visual hierarchy
        if (d.kind === 'function') return COLORS.functionFill;
        if (d.kind === 'method') return COLORS.methodFill;
        if (d.kind === 'class') return COLORS.classFill;
        return COLORS.functionFill;
      })
      .attr('stroke', (d: LayoutNode) => {
        if (d.id === selectedNodeId) return COLORS.selectedStroke;
        if (connectedNodeIds.has(d.id) && d.id !== selectedNodeId) return COLORS.selected;
        // Use kind-based accent colors
        return COLORS[d.kind] ?? COLORS.function;
      })
      .attr('stroke-width', (d: LayoutNode) => {
        if (d.id === selectedNodeId) return 2.5;
        if (connectedNodeIds.has(d.id)) return 2;
        return 1.5;
      })
      .attr('filter', (d: LayoutNode) =>
        d.id === selectedNodeId ? 'url(#node-glow)' : 'url(#node-shadow)'
      );

    // Node label (hidden at low zoom) with improved typography
    nodeElements.append('text')
      .attr('class', 'node-label')
      .attr('x', (d: LayoutNode) => d.width / 2)
      .attr('y', (d: LayoutNode) => d.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', COLORS.textPrimary)
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .attr('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif")
      .attr('letter-spacing', '-0.01em')
      .style('text-shadow', '0 1px 2px rgba(0, 0, 0, 0.5)')
      .text((d: LayoutNode) => {
        // Calculate max chars based on node width (matches dagre-layout calculation)
        const CHAR_WIDTH = 7; // Slightly less than layout's 8px for visual safety
        const PADDING = 16; // Text padding inside node
        const availableWidth = d.width - PADDING;
        const maxChars = Math.floor(availableWidth / CHAR_WIDTH);

        if (d.name.length <= maxChars) {
          return d.name;
        }
        // Truncate with ellipsis
        return d.name.slice(0, maxChars - 1) + '…';
      });

    // Hover tooltip (shows full name + stats)
    // Use layout.edges to avoid stale closure with edges from store
    nodeElements.append('title')
      .text((d: LayoutNode) => {
        const callerCount = layout.edges.filter(e => e.target === d.id).length;
        const calleeCount = layout.edges.filter(e => e.source === d.id).length;
        return `${d.name}\n${d.kind} · ${callerCount} callers · ${calleeCount} calls`;
      });

    // Initial fit
    const scale = Math.min(
      (width - 80) / layout.width,
      (height - 80) / layout.height,
      2
    );
    const translateX = (width - layout.width * scale) / 2;
    const translateY = (height - layout.height * scale) / 2;

    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );

  }, [layout, selectedNodeId, setSelectedNode, navigateToNode]);

  // Clear focus mode when selection is cleared
  useEffect(() => {
    if (!selectedNodeId && focusMode) {
      setFocusMode(false);
    }
  }, [selectedNodeId, focusMode]);

  // Show loading skeleton when no data yet
  const showLoading = nodes.length === 0 && (!isConnected || isAnalyzing);
  const showEmptyState = nodes.length === 0 && isConnected && !isAnalyzing;

  return (
    <div ref={containerRef} className="graph-container">
      <svg ref={svgRef} width="100%" height="100%" />

      {/* Loading Skeleton */}
      {showLoading && (
        <div className="graph-skeleton">
          <div className="skeleton-content">
            <div className="skeleton-spinner" />
            <p>{!isConnected ? 'Connecting to server...' : 'Analyzing codebase...'}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {showEmptyState && (
        <div className="graph-empty">
          <div className="empty-content">
            <h3>No code analyzed yet</h3>
            <p>Start the analyzer on a directory to see the call graph</p>
            <code>npm start -- serve ./your-project</code>
          </div>
        </div>
      )}

      {/* Zoom Controls */}
      <div className="zoom-controls">
        <button onClick={zoomIn} title="Zoom In">+</button>
        <button onClick={zoomOut} title="Zoom Out">−</button>
        <button onClick={fitToScreen} title="Fit to Screen">Fit</button>
        <button onClick={resetZoom} title="Reset Zoom">Reset</button>
        <span className="zoom-level">{Math.round(currentZoom * 100)}%</span>
      </div>

      {/* Filter Controls */}
      <div className="filter-controls">
        <button
          onClick={() => setShowChangedOnly(!showChangedOnly)}
          className={showChangedOnly ? 'active' : ''}
          disabled={changedNodeCount === 0}
          title={showChangedOnly ? 'Show all nodes' : 'Show only changed code + callers/callees'}
        >
          {showChangedOnly ? 'Show All' : `Changed (${changedNodeCount})`}
        </button>
      </div>

      {/* Focus Mode Controls */}
      <div className="focus-controls">
        <button
          onClick={toggleFocusMode}
          className={focusMode ? 'active' : ''}
          disabled={!selectedNodeId && !focusMode}
          title={focusMode ? 'Show all nodes' : 'Focus on selected node'}
        >
          {focusMode ? 'Show All' : 'Focus'}
        </button>
        {focusMode && (
          <select
            value={focusDepth}
            onChange={(e) => setFocusDepth(Number(e.target.value))}
            title="Focus Depth"
          >
            <option value={1}>1 level</option>
            <option value={2}>2 levels</option>
            <option value={3}>3 levels</option>
          </select>
        )}
      </div>

      {/* Legend - Collapsible - Shows only node types and edge types */}
      <div className={`graph-legend ${legendExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="legend-toggle"
          onClick={() => setLegendExpanded(!legendExpanded)}
          title={legendExpanded ? 'Hide legend' : 'Show legend'}
        >
          <span className={legendExpanded ? 'icon-chevron-down' : 'icon-chevron-up'} /> Legend
        </button>
        {legendExpanded && (
          <div className="legend-content">
            <div className="legend-section">
              <div className="legend-section-title">Node Types</div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: COLORS.function }} />
                <span>Function</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: COLORS.method }} />
                <span>Method</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: COLORS.class }} />
                <span>Class</span>
              </div>
            </div>
            <div className="legend-section">
              <div className="legend-section-title">Edges</div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: COLORS.incomingEdge }} />
                <span>Callers (incoming)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: COLORS.outgoingEdge }} />
                <span>Calls (outgoing)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={getContextMenuItems(contextMenu.nodeId)}
        />
      )}
    </div>
  );

  // Generate context menu items for a node
  function getContextMenuItems(nodeId: string): ContextMenuItem[] {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    return [
      {
        label: 'Focus on this node',
        action: () => {
          navigateToNode(nodeId);
          setFocusMode(true);
        },
      },
      {
        label: 'Find callers',
        action: () => {
          navigateToNode(nodeId);
        },
      },
      {
        label: 'Find callees',
        action: () => {
          navigateToNode(nodeId);
        },
      },
      { label: '', action: () => {}, divider: true },
      {
        label: 'Copy name',
        action: () => {
          navigator.clipboard.writeText(node.name);
        },
      },
      {
        label: 'Copy path',
        action: () => {
          navigator.clipboard.writeText(`${node.filePath}:${node.location.startLine}`);
        },
      },
      { label: '', action: () => {}, divider: true },
      {
        label: focusMode ? 'Exit focus' : 'Enter focus',
        action: () => {
          if (!focusMode) {
            navigateToNode(nodeId);
          }
          setFocusMode(!focusMode);
        },
      },
    ];
  }
});
