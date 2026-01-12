/**
 * Interactive Graph Visualization Component
 * Features: Edge highlighting, focus mode, file grouping, keyboard shortcuts
 */

import { useEffect, useRef, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '../lib/store';
import { layoutGraph, type LayoutNode, type LayoutEdge } from '../lib/dagre-layout';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

const COLORS: Record<string, string> = {
  function: '#3b82f6',
  method: '#8b5cf6',
  class: '#10b981',
  module: '#6b7280',
  selected: '#f59e0b',
  edge: '#475569',
  callEdge: '#3b82f6',
  importEdge: '#10b981',
  highlightEdge: '#f59e0b',
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

    // Focus mode: only show neighbors
    if (focusMode && selectedNodeId) {
      const neighbors = getNeighbors(selectedNodeId, focusDepth);
      filteredNodes = filteredNodes.filter((n) => neighbors.has(n.id));
      filteredEdges = filteredEdges.filter(
        (e) => neighbors.has(e.source) && neighbors.has(e.target)
      );
    }

    return layoutGraph(filteredNodes, filteredEdges, { rankdir: 'TB' });
  }, [nodes, edges, searchQuery, focusMode, selectedNodeId, focusDepth, getNeighbors]);

  // Compute file -> color mapping for legend
  const fileColors = useMemo(() => {
    const colors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#f97316', // orange
      '#ec4899', // pink
    ];
    const map = new Map<string, string>();
    let colorIndex = 0;
    for (const node of layout.nodes) {
      const fileName = node.filePath.split('/').pop() || 'unknown';
      if (!map.has(fileName)) {
        map.set(fileName, colors[colorIndex % colors.length]);
        colorIndex++;
      }
    }
    return Array.from(map.entries());
  }, [layout.nodes]);

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
        // Hide labels below 40% zoom
        g.selectAll('.node-label').style('opacity', k >= 0.4 ? 1 : 0);

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

    // Group nodes by file
    const fileGroups = new Map<string, LayoutNode[]>();
    for (const node of layout.nodes) {
      const fileName = node.filePath.split('/').pop() || 'unknown';
      if (!fileColorMap.has(fileName)) {
        fileColorMap.set(fileName, fileColors[fileColorIndex % fileColors.length]);
        fileColorIndex++;
      }
      if (!fileGroups.has(fileName)) {
        fileGroups.set(fileName, []);
      }
      fileGroups.get(fileName)!.push(node);
    }

    // Draw file group backgrounds with better contrast
    if (fileGroups.size > 1 && fileGroups.size <= 20) {
      const groupBgLayer = g.append('g').attr('class', 'file-groups');

      for (const [fileName, groupNodes] of fileGroups) {
        if (groupNodes.length < 1) continue;

        const color = fileColorMap.get(fileName) || '#475569';
        const xs = groupNodes.map((n) => n.x);
        const ys = groupNodes.map((n) => n.y);
        const minX = Math.min(...xs) - 90;
        const maxX = Math.max(...xs) + 90;
        const minY = Math.min(...ys) - 50;
        const maxY = Math.max(...ys) + 50;

        // Background rectangle - more visible
        groupBgLayer.append('rect')
          .attr('x', minX)
          .attr('y', minY)
          .attr('width', maxX - minX)
          .attr('height', maxY - minY)
          .attr('rx', 8)
          .attr('fill', color)
          .attr('opacity', 0.12)
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 0.6);

        // File name label - prominent
        groupBgLayer.append('text')
          .attr('x', minX + 10)
          .attr('y', minY + 18)
          .attr('fill', color)
          .attr('font-size', '12px')
          .attr('font-weight', 600)
          .attr('opacity', 0.9)
          .text(fileName);
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
          return incomingEdgeIds.has(d.id) ? '#22c55e' : '#f59e0b'; // Green for incoming, orange for outgoing
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

    // Node background
    nodeElements.append('rect')
      .attr('width', (d: LayoutNode) => d.width)
      .attr('height', (d: LayoutNode) => d.height)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', (d: LayoutNode) =>
        d.id === selectedNodeId ? COLORS.selected : COLORS[d.kind] ?? COLORS.function
      )
      .attr('stroke', (d: LayoutNode) => {
        if (d.id === selectedNodeId) return '#fbbf24';
        if (connectedNodeIds.has(d.id) && d.id !== selectedNodeId) return '#f59e0b';
        // Use file-based color for unselected nodes
        const fileName = d.filePath.split('/').pop() || 'unknown';
        return fileColorMap.get(fileName) || '#475569';
      })
      .attr('stroke-width', (d: LayoutNode) => {
        if (d.id === selectedNodeId) return 3;
        if (connectedNodeIds.has(d.id)) return 2;
        return 2; // Thicker default stroke to show file color
      });

    // Node label (hidden at low zoom)
    nodeElements.append('text')
      .attr('class', 'node-label')
      .attr('x', (d: LayoutNode) => d.width / 2)
      .attr('y', (d: LayoutNode) => d.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .text((d: LayoutNode) =>
        d.name.length > 18 ? d.name.slice(0, 16) + '...' : d.name
      );

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
            <div className="empty-icon">📂</div>
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
        <button onClick={fitToScreen} title="Fit to Screen">⊡</button>
        <button onClick={resetZoom} title="Reset Zoom">↺</button>
        <span className="zoom-level">{Math.round(currentZoom * 100)}%</span>
      </div>

      {/* Focus Mode Controls */}
      <div className="focus-controls">
        <button
          onClick={toggleFocusMode}
          className={focusMode ? 'active' : ''}
          disabled={!selectedNodeId && !focusMode}
          title={focusMode ? 'Show all nodes' : 'Focus on selected node'}
        >
          {focusMode ? '👁 Show All' : '◎ Focus'}
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

      {/* Legend - Collapsible */}
      <div className={`graph-legend ${legendExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="legend-toggle"
          onClick={() => setLegendExpanded(!legendExpanded)}
          title={legendExpanded ? 'Hide legend' : 'Show legend'}
        >
          {legendExpanded ? '▼ Legend' : '▲ Legend'}
        </button>
        {legendExpanded && (
          <div className="legend-content">
            <div className="legend-section">
              <div className="legend-section-title">Edges</div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: '#22c55e' }} />
                <span>Callers</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: '#f59e0b' }} />
                <span>Calls</span>
              </div>
            </div>
            <div className="legend-section">
              <div className="legend-section-title">Files (border)</div>
              {fileColors.slice(0, 8).map(([fileName, color]) => (
                <div key={fileName} className="legend-item">
                  <span className="legend-color" style={{ background: color }} />
                  <span>{fileName}</span>
                </div>
              ))}
              {fileColors.length > 8 && (
                <div className="legend-item muted">+{fileColors.length - 8} more</div>
              )}
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
        icon: '◎',
        action: () => {
          navigateToNode(nodeId);
          setFocusMode(true);
        },
      },
      {
        label: 'Find callers',
        icon: '↙',
        action: () => {
          navigateToNode(nodeId);
          // Callers are shown in the sidebar
        },
      },
      {
        label: 'Find callees',
        icon: '↗',
        action: () => {
          navigateToNode(nodeId);
          // Callees are shown in the sidebar
        },
      },
      { label: '', action: () => {}, divider: true },
      {
        label: 'Copy node name',
        icon: '📋',
        action: () => {
          navigator.clipboard.writeText(node.name);
        },
      },
      {
        label: 'Copy file path',
        icon: '📁',
        action: () => {
          navigator.clipboard.writeText(`${node.filePath}:${node.location.startLine}`);
        },
      },
      { label: '', action: () => {}, divider: true },
      {
        label: focusMode ? 'Exit focus mode' : 'Enter focus mode',
        icon: focusMode ? '⊙' : '◉',
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
