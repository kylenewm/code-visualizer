/**
 * Module Dependency Diagram
 * Visual SVG-based diagram showing module dependencies
 */

import { useMemo, useState } from 'react';
import type { ModuleGraph, ModuleNode, ModuleEdge } from '../lib/store';

interface ModulePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramProps {
  moduleGraph: ModuleGraph;
  onModuleClick?: (moduleId: string) => void;
}

/** Calculate positions for modules using a simple layered layout */
function calculateLayout(
  modules: ModuleNode[],
  edges: ModuleEdge[]
): Map<string, ModulePosition> {
  const positions = new Map<string, ModulePosition>();

  if (modules.length === 0) return positions;

  // Build adjacency and reverse adjacency
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const m of modules) {
    outgoing.set(m.id, new Set());
    incoming.set(m.id, new Set());
  }

  for (const edge of edges) {
    outgoing.get(edge.source)?.add(edge.target);
    incoming.get(edge.target)?.add(edge.source);
  }

  // Assign layers using topological ordering
  const layers = new Map<string, number>();
  const assigned = new Set<string>();

  // Start with modules that have no incoming edges (or all)
  let currentLayer = 0;
  const queue = modules.filter(m => (incoming.get(m.id)?.size || 0) === 0);

  // If everything has dependencies, start with largest module
  if (queue.length === 0) {
    const sorted = [...modules].sort((a, b) => b.functionCount - a.functionCount);
    queue.push(sorted[0]);
  }

  while (assigned.size < modules.length) {
    const nextQueue: ModuleNode[] = [];

    for (const mod of queue) {
      if (assigned.has(mod.id)) continue;
      layers.set(mod.id, currentLayer);
      assigned.add(mod.id);

      // Add targets to next layer
      const targets = outgoing.get(mod.id) || new Set();
      for (const targetId of targets) {
        const target = modules.find(m => m.id === targetId);
        if (target && !assigned.has(targetId)) {
          nextQueue.push(target);
        }
      }
    }

    // If no progress, add remaining unassigned modules
    if (nextQueue.length === 0) {
      for (const mod of modules) {
        if (!assigned.has(mod.id)) {
          nextQueue.push(mod);
          break;
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);
    currentLayer++;

    // Safety: prevent infinite loop
    if (currentLayer > modules.length) break;
  }

  // Group modules by layer
  const layerGroups = new Map<number, ModuleNode[]>();
  for (const mod of modules) {
    const layer = layers.get(mod.id) || 0;
    const group = layerGroups.get(layer) || [];
    group.push(mod);
    layerGroups.set(layer, group);
  }

  // Position modules - compact layout
  const BOX_WIDTH = 120;
  const BOX_HEIGHT = 50;
  const H_GAP = 30;
  const V_GAP = 40;
  const PADDING = 20;

  // First pass: calculate positions centered at origin
  const tempPositions: { mod: ModuleNode; x: number; y: number }[] = [];

  for (const [layer, group] of layerGroups) {
    const y = layer * (BOX_HEIGHT + V_GAP) + PADDING;
    const totalWidth = group.length * BOX_WIDTH + (group.length - 1) * H_GAP;
    const startX = -totalWidth / 2; // Center around 0

    group.forEach((mod, i) => {
      tempPositions.push({
        mod,
        x: startX + i * (BOX_WIDTH + H_GAP),
        y,
      });
    });
  }

  // Find minimum X to ensure nothing is cut off
  const minX = Math.min(...tempPositions.map(p => p.x));
  const offsetX = PADDING - minX; // Shift everything so minimum is at PADDING

  // Apply offset and set final positions
  for (const { mod, x, y } of tempPositions) {
    positions.set(mod.id, {
      x: x + offsetX,
      y,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
    });
  }

  return positions;
}

/** Get short module name */
function getShortName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Calculate arrow path between two boxes */
function getArrowPath(
  from: ModulePosition,
  to: ModulePosition
): string {
  const fromCenterX = from.x + from.width / 2;
  const fromBottom = from.y + from.height;
  const toCenterX = to.x + to.width / 2;
  const toTop = to.y;

  // Simple curved path
  const midY = (fromBottom + toTop) / 2;
  return `M ${fromCenterX} ${fromBottom} C ${fromCenterX} ${midY}, ${toCenterX} ${midY}, ${toCenterX} ${toTop}`;
}

export function ModuleDiagram({ moduleGraph, onModuleClick }: DiagramProps) {
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const positions = useMemo(
    () => calculateLayout(moduleGraph.modules, moduleGraph.edges),
    [moduleGraph]
  );

  // Calculate SVG dimensions - compact
  const svgSize = useMemo(() => {
    let maxX = 300;
    let maxY = 100;
    for (const pos of positions.values()) {
      maxX = Math.max(maxX, pos.x + pos.width + 20);
      maxY = Math.max(maxY, pos.y + pos.height + 16);
    }
    return { width: maxX, height: maxY };
  }, [positions]);

  // Get edges with positions
  const edgesWithPositions = useMemo(() => {
    return moduleGraph.edges
      .map(edge => {
        const fromPos = positions.get(edge.source);
        const toPos = positions.get(edge.target);
        if (!fromPos || !toPos) return null;
        return { edge, fromPos, toPos };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [moduleGraph.edges, positions]);

  if (moduleGraph.modules.length === 0) {
    return null;
  }

  return (
    <div className={`module-diagram ${isCollapsed ? 'collapsed' : ''}`}>
      <h3
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {isCollapsed ? '▶' : '▼'} Module Dependencies
      </h3>
      {!isCollapsed && (
      <div className="diagram-container">
        <svg
          width={svgSize.width}
          height={svgSize.height}
          viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker
              id="arrowhead-highlight"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
            </marker>
          </defs>

          {/* Edges */}
          <g className="diagram-edges">
            {edgesWithPositions.map(({ edge, fromPos, toPos }, i) => {
              const isHighlighted =
                hoveredModule === edge.source || hoveredModule === edge.target;
              return (
                <path
                  key={i}
                  d={getArrowPath(fromPos, toPos)}
                  fill="none"
                  stroke={isHighlighted ? '#3b82f6' : '#475569'}
                  strokeWidth={isHighlighted ? 2 : 1.5}
                  strokeOpacity={isHighlighted ? 1 : 0.6}
                  markerEnd={`url(#arrowhead${isHighlighted ? '-highlight' : ''})`}
                />
              );
            })}
          </g>

          {/* Module boxes */}
          <g className="diagram-modules">
            {moduleGraph.modules.map(mod => {
              const pos = positions.get(mod.id);
              if (!pos) return null;

              const isHovered = hoveredModule === mod.id;
              const isConnected =
                hoveredModule &&
                (moduleGraph.edges.some(
                  e =>
                    (e.source === hoveredModule && e.target === mod.id) ||
                    (e.target === hoveredModule && e.source === mod.id)
                ));

              return (
                <g
                  key={mod.id}
                  className={`module-box ${mod.recentlyChanged ? 'changed' : ''} ${isHovered ? 'hovered' : ''}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseEnter={() => setHoveredModule(mod.id)}
                  onMouseLeave={() => setHoveredModule(null)}
                  onClick={() => onModuleClick?.(mod.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={pos.width}
                    height={pos.height}
                    rx={6}
                    fill={
                      mod.recentlyChanged
                        ? 'rgba(251, 146, 60, 0.15)'
                        : isHovered || isConnected
                        ? 'rgba(59, 130, 246, 0.15)'
                        : '#1e293b'
                    }
                    stroke={
                      mod.recentlyChanged
                        ? '#fb923c'
                        : isHovered
                        ? '#3b82f6'
                        : isConnected
                        ? '#60a5fa'
                        : '#334155'
                    }
                    strokeWidth={mod.recentlyChanged || isHovered ? 2 : 1}
                  />
                  <text
                    x={pos.width / 2}
                    y={pos.height / 2 - 6}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {getShortName(mod.path)}
                  </text>
                  <text
                    x={pos.width / 2}
                    y={pos.height / 2 + 10}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                  >
                    {mod.functionCount} fn · {mod.files.length} files
                  </text>
                  {mod.recentlyChanged && (
                    <text
                      x={pos.width / 2}
                      y={pos.height / 2 + 24}
                      textAnchor="middle"
                      fill="#fb923c"
                      fontSize="9"
                      fontWeight="600"
                    >
                      CHANGED
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      )}
    </div>
  );
}
