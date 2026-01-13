/**
 * Node Details Sidebar Component
 * Shows flow-oriented view: How we get here → What it does → Where it goes
 */

import { useGraphStore } from '../lib/store';

interface NodeDetailsProps {
  viewMode: 'architecture' | 'recent' | 'walkthrough' | 'graph';
}

/** Format timestamp as relative time (e.g., "2m ago") */
function formatTimeAgo(timestamp: number | undefined): string | null {
  if (!timestamp) return null;
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NodeDetails({ viewMode }: NodeDetailsProps) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const getNode = useGraphStore((s) => s.getNode);
  const getCallees = useGraphStore((s) => s.getCallees);
  const getCallers = useGraphStore((s) => s.getCallers);
  const getCallChainTo = useGraphStore((s) => s.getCallChainTo);
  const getImpact = useGraphStore((s) => s.getImpact);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const drillDownToWalkthrough = useGraphStore((s) => s.drillDownToWalkthrough);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);

  // Context-aware navigation: in walkthrough view, drill down to update entry point
  const handleNodeNavigation = (nodeId: string) => {
    if (viewMode === 'walkthrough') {
      drillDownToWalkthrough(nodeId);
    } else {
      navigateToNode(nodeId);
    }
  };

  const node = selectedNodeId ? getNode(selectedNodeId) : null;
  const callees = selectedNodeId ? getCallees(selectedNodeId) : [];
  const directCallers = selectedNodeId ? getCallers(selectedNodeId) : [];
  const callChains = selectedNodeId ? getCallChainTo(selectedNodeId) : [];
  const impact = selectedNodeId ? getImpact(selectedNodeId) : { callers: [], depth: new Map() };

  if (!node) {
    return (
      <div className="node-details">
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>Select a node to explore</h3>
          <p>Click any function, method, or class in the graph to see its flow</p>
          <div className="empty-state-tips">
            <div className="tip"><kbd>/</kbd> Search nodes</div>
            <div className="tip"><kbd>dbl-click</kbd> Focus mode</div>
            <div className="tip"><kbd>right-click</kbd> Context menu</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="node-details">
      {/* Header */}
      <header>
        <h2>{node.name}</h2>
        <div className="header-badges">
          <span className={`kind-badge ${node.kind}`}>{node.kind}</span>
          {node.category && <span className="category-badge">{node.category}</span>}
          {node.lastModified && (
            <span className="modified-badge" title={new Date(node.lastModified).toLocaleString()}>
              {formatTimeAgo(node.lastModified)}
            </span>
          )}
        </div>
      </header>

      {/* Location */}
      <section className="location-section">
        <div className="location-row">
          <FilePathBreadcrumb
            filePath={node.filePath}
            onSegmentClick={(segment) => setSearchQuery(segment)}
          />
          <span className="line-number">L{node.location.startLine}-{node.location.endLine}</span>
          <button
            className="copy-btn"
            onClick={() => navigator.clipboard.writeText(`${node.filePath}:${node.location.startLine}`)}
            title="Copy path with line number"
          >
            📋
          </button>
        </div>
      </section>

      {/* HOW WE GET HERE */}
      <section className="flow-section">
        <h3 className="flow-header">
          <span className="flow-icon">↓</span>
          How We Get Here
        </h3>
        {callChains.length > 0 && callChains[0].length > 1 ? (
          <div className="call-chains">
            {callChains.slice(0, 2).map((chain, chainIdx) => (
              <div key={chainIdx} className="call-chain">
                {chain.map((chainNode, idx) => (
                  <span key={`${chainNode.id}-${idx}`} className="chain-item">
                    {idx > 0 && <span className="chain-arrow">→</span>}
                    <button
                      className={`chain-node ${chainNode.id === node.id ? 'current' : ''}`}
                      onClick={() => chainNode.id !== node.id && handleNodeNavigation(chainNode.id)}
                      disabled={chainNode.id === node.id}
                    >
                      <span className={`kind-dot ${chainNode.kind}`} />
                      {chainNode.name}
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Entry point (no callers)</p>
        )}
      </section>

      {/* WHAT IT DOES */}
      <section className="flow-section source-section">
        <h3 className="flow-header">
          <span className="flow-icon">◆</span>
          What It Does
        </h3>

        {node.description && (
          <p className="description-text">{node.description}</p>
        )}

        {node.signature && (
          <div className="signature-row">
            <code className="signature">{node.signature}</code>
            <button
              className="copy-btn"
              onClick={() => navigator.clipboard.writeText(node.signature || '')}
              title="Copy signature"
            >
              📋
            </button>
          </div>
        )}

        {node.sourcePreview ? (
          <pre className="source-preview"><code>{node.sourcePreview}</code></pre>
        ) : (
          <p className="muted">No source preview available</p>
        )}
      </section>

      {/* IMPACT ANALYSIS */}
      <section className="flow-section impact-section">
        <h3 className="flow-header">
          <span className="flow-icon">⚡</span>
          Impact Analysis
        </h3>
        {impact.callers.length > 0 ? (
          <>
            <div className="impact-summary">
              <div className="impact-stat impact-warning">
                <span className="impact-number">{impact.callers.length}</span>
                <span className="impact-label">functions affected</span>
              </div>
              <div className="impact-stat">
                <span className="impact-number">{directCallers.length}</span>
                <span className="impact-label">direct callers</span>
              </div>
              <div className="impact-stat">
                <span className="impact-number">{impact.callers.length - directCallers.length}</span>
                <span className="impact-label">indirect</span>
              </div>
            </div>
            <details className="impact-details">
              <summary>View affected functions</summary>
              <ul className="impact-list">
                {impact.callers.slice(0, 20).map((caller) => {
                  const depth = impact.depth.get(caller.id) || 0;
                  return (
                    <li
                      key={caller.id}
                      onClick={() => handleNodeNavigation(caller.id)}
                      className="clickable impact-item"
                    >
                      <span className={`depth-badge depth-${Math.min(depth, 3)}`}>
                        {depth === 1 ? 'direct' : `+${depth}`}
                      </span>
                      <span className={`kind-dot ${caller.kind}`} />
                      <span className="impact-name">{caller.name}</span>
                      <span className="impact-file">{caller.filePath.split('/').pop()}</span>
                    </li>
                  );
                })}
                {impact.callers.length > 20 && (
                  <li className="impact-more">
                    ... and {impact.callers.length - 20} more
                  </li>
                )}
              </ul>
            </details>
          </>
        ) : (
          <p className="muted impact-safe">No callers - changes here are isolated</p>
        )}
      </section>

      {/* WHERE IT GOES */}
      <section className="flow-section">
        <h3 className="flow-header">
          <span className="flow-icon">↓</span>
          Where It Goes ({callees.length})
        </h3>
        {callees.length > 0 ? (
          <ul className="node-list callees-list">
            {callees.map((callee) => (
              <li
                key={callee.id}
                onClick={() => handleNodeNavigation(callee.id)}
                className="clickable callee-item"
              >
                <div className="callee-header">
                  <span className={`kind-dot ${callee.kind}`} />
                  <span className="callee-name">{callee.name}</span>
                </div>
                {callee.description && (
                  <p className="callee-desc">{callee.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No outgoing calls</p>
        )}
      </section>

      {/* Properties (collapsed) */}
      <details className="properties-section">
        <summary>Properties</summary>
        <dl>
          <dt>Exported</dt>
          <dd>{node.exported ? 'Yes' : 'No'}</dd>
          <dt>Kind</dt>
          <dd>{node.kind}</dd>
          {node.category && (
            <>
              <dt>Category</dt>
              <dd>{node.category}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}

// Helper component for clickable file path segments
function FilePathBreadcrumb({
  filePath,
  onSegmentClick,
}: {
  filePath: string;
  onSegmentClick: (segment: string) => void;
}) {
  // Split path and get filename
  const segments = filePath.split('/').filter(Boolean);
  const fileName = segments.pop() || '';

  // Show last 2 directories + filename
  const visibleDirs = segments.slice(-2);
  const hasMore = segments.length > 2;

  return (
    <span className="file-path-breadcrumb">
      {hasMore && <span className="path-ellipsis">...</span>}
      {visibleDirs.map((segment, i) => (
        <span key={i}>
          <button
            className="path-segment"
            onClick={() => onSegmentClick(segment)}
            title={`Filter by "${segment}"`}
          >
            {segment}
          </button>
          <span className="path-separator">/</span>
        </span>
      ))}
      <button
        className="path-segment path-filename"
        onClick={() => onSegmentClick(fileName)}
        title={`Filter by "${fileName}"`}
      >
        {fileName}
      </button>
    </span>
  );
}
