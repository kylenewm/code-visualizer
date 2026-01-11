/**
 * Call Tree Walkthrough View
 * Shows execution flow from an entry point with source code inline
 */

import { useState, useMemo, useEffect } from 'react';
import { useGraphStore, type CallTreeNode, type GraphNode } from '../lib/store';

/** Format line range compactly */
function formatLines(start: number, end: number): string {
  return start === end ? `L${start}` : `L${start}-${end}`;
}

/** Get filename from path */
function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/** Source preview with expand/collapse */
function SourcePreview({ source, description }: { source: string; description?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lines = source.split('\n');
  const hasMore = lines.length > 5;
  const displaySource = isExpanded ? source : lines.slice(0, 5).join('\n') + (hasMore ? '\n  // ...' : '');

  return (
    <div className="tree-source">
      {description && (
        <p className="tree-description">{description}</p>
      )}
      <pre><code>{displaySource}</code></pre>
      {hasMore && (
        <button
          className="source-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? '▲ Show less' : '▼ Show more'}
        </button>
      )}
    </div>
  );
}

/** TreeNode component - renders a single node and its children */
function TreeNodeView({
  treeNode,
  selectedId,
  onSelect,
  expandedNodes,
  onToggleExpand,
}: {
  treeNode: CallTreeNode;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
}) {
  const { node, children, depth, isRecentlyModified } = treeNode;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="tree-node" style={{ '--depth': depth } as React.CSSProperties}>
      <div
        className={`tree-node-header ${isSelected ? 'selected' : ''} ${isRecentlyModified ? 'modified' : ''}`}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            className="tree-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}

        {/* Step number */}
        <span className="tree-step">{depth + 1}.</span>

        {/* Node info */}
        <span className={`kind-dot ${node.kind}`} />
        <span className="tree-node-name">{node.name}</span>

        {/* Badges */}
        {isRecentlyModified && <span className="changed-badge">CHANGED</span>}

        {/* Location */}
        <span className="tree-location">
          {getFileName(node.filePath)}:{formatLines(node.location.startLine, node.location.endLine)}
        </span>
      </div>

      {/* Source preview (always shown for depth 0, or when expanded) */}
      {(depth === 0 || isExpanded) && node.sourcePreview && (
        <SourcePreview source={node.sourcePreview} description={node.description} />
      )}

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeNodeView
              key={child.node.id}
              treeNode={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Entry point selector */
function EntryPointSelector({
  entryPoints,
  recentNodes,
  selectedEntry,
  onSelect,
}: {
  entryPoints: GraphNode[];
  recentNodes: GraphNode[];
  selectedEntry: string | null;
  onSelect: (nodeId: string) => void;
}) {
  // Combine entry points with recently modified nodes (prioritize recent)
  const options = useMemo(() => {
    const seen = new Set<string>();
    const result: GraphNode[] = [];

    // Add recently modified exported functions first
    for (const node of recentNodes) {
      if (node.exported && (node.kind === 'function' || node.kind === 'method')) {
        if (!seen.has(node.id)) {
          seen.add(node.id);
          result.push(node);
        }
      }
    }

    // Then add other entry points
    for (const node of entryPoints) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        result.push(node);
      }
    }

    return result.slice(0, 20); // Limit to 20
  }, [entryPoints, recentNodes]);

  if (options.length === 0) {
    return (
      <div className="entry-selector empty">
        <p>No entry points found</p>
        <p className="muted">Entry points are exported functions with no callers</p>
      </div>
    );
  }

  return (
    <div className="entry-selector">
      <label>Start from:</label>
      <select
        value={selectedEntry || ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select entry point...</option>
        {options.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name} ({getFileName(node.filePath)})
            {recentNodes.some(n => n.id === node.id) ? ' [RECENT]' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CallTreeView() {
  const getCallTree = useGraphStore((s) => s.getCallTree);
  const getEntryPoints = useGraphStore((s) => s.getEntryPoints);
  const getRecentlyModifiedNodes = useGraphStore((s) => s.getRecentlyModifiedNodes);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const nodes = useGraphStore((s) => s.nodes);
  const drillDownEntryId = useGraphStore((s) => s.drillDownEntryId);
  const clearDrillDown = useGraphStore((s) => s.clearDrillDown);
  const requestView = useGraphStore((s) => s.requestView);

  // State
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [maxDepth, setMaxDepth] = useState(3);

  // Use drill-down entry if set, otherwise use local selection
  useEffect(() => {
    if (drillDownEntryId) {
      setSelectedEntry(drillDownEntryId);
      // Auto-expand the first level when drilling down
      setExpandedNodes(new Set([drillDownEntryId]));
      clearDrillDown();
    }
  }, [drillDownEntryId, clearDrillDown]);

  // Data
  const entryPoints = getEntryPoints();
  const recentNodes = getRecentlyModifiedNodes(10 * 60 * 1000);

  // Auto-select most recent entry if none selected
  const effectiveEntry = selectedEntry || (recentNodes.find(n => n.exported)?.id) || entryPoints[0]?.id;

  // Build tree
  const callTree = effectiveEntry ? getCallTree(effectiveEntry, maxDepth) : null;

  // Toggle expand
  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Expand all
  const handleExpandAll = () => {
    if (!callTree) return;
    const allIds = new Set<string>();
    const collect = (node: CallTreeNode) => {
      if (node.children.length > 0) {
        allIds.add(node.node.id);
        node.children.forEach(collect);
      }
    };
    collect(callTree);
    setExpandedNodes(allIds);
  };

  // Collapse all
  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Count total nodes in tree
  const countNodes = (tree: CallTreeNode | null): number => {
    if (!tree) return 0;
    return 1 + tree.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  if (nodes.length === 0) {
    return (
      <div className="call-tree-view">
        <div className="call-tree-empty">
          <div className="empty-icon">🌲</div>
          <h3>No code analyzed yet</h3>
          <p>Connect to see execution flow</p>
        </div>
      </div>
    );
  }

  return (
    <div className="call-tree-view">
      {/* Header */}
      <header className="call-tree-header">
        <div className="call-tree-title">
          <button
            className="back-to-architecture"
            onClick={() => requestView('architecture')}
            title="Back to Architecture"
          >
            ← Architecture
          </button>
          <h2>Execution Flow</h2>
        </div>
        <div className="call-tree-controls">
          <EntryPointSelector
            entryPoints={entryPoints}
            recentNodes={recentNodes}
            selectedEntry={selectedEntry}
            onSelect={setSelectedEntry}
          />
          <div className="depth-control">
            <label>Depth:</label>
            <input
              type="range"
              min={1}
              max={10}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
            />
            <span>{maxDepth}</span>
          </div>
        </div>
      </header>

      {/* Tree actions */}
      {callTree && (
        <div className="call-tree-actions">
          <button onClick={handleExpandAll}>Expand All</button>
          <button onClick={handleCollapseAll}>Collapse All</button>
          <span className="node-count">{countNodes(callTree)} functions</span>
        </div>
      )}

      {/* Tree */}
      <div className="call-tree-content">
        {callTree ? (
          <TreeNodeView
            treeNode={callTree}
            selectedId={null}
            onSelect={navigateToNode}
            expandedNodes={expandedNodes}
            onToggleExpand={handleToggleExpand}
          />
        ) : (
          <div className="call-tree-empty">
            <p>Select an entry point to see execution flow</p>
          </div>
        )}
      </div>
    </div>
  );
}
