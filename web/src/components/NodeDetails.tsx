/**
 * Node Details Sidebar Component
 * Shows flow-oriented view: How we get here → What it does → Where it goes
 */

import { useEffect } from 'react';
import { useGraphStore, type DriftSeverity } from '../lib/store';

interface NodeDetailsProps {
  viewMode: 'architecture' | 'recent' | 'walkthrough' | 'graph';
}

/** Format timestamp as relative time (e.g., "2m ago") */
function formatTimeAgoShort(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Get severity badge class */
function getSeverityClass(severity: DriftSeverity): string {
  switch (severity) {
    case 'high': return 'severity-high';
    case 'medium': return 'severity-medium';
    case 'low': return 'severity-low';
    default: return '';
  }
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
  const isAnnotationStale = useGraphStore((s) => s.isAnnotationStale);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const drillDownToWalkthrough = useGraphStore((s) => s.drillDownToWalkthrough);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const getNodeDrift = useGraphStore((s) => s.getNodeDrift);
  const getAnnotationHistory = useGraphStore((s) => s.getAnnotationHistory);
  const getDriftHistory = useGraphStore((s) => s.getDriftHistory);
  const setAnnotationHistory = useGraphStore((s) => s.setAnnotationHistory);
  const setDriftHistory = useGraphStore((s) => s.setDriftHistory);
  const setNodeDrift = useGraphStore((s) => s.setNodeDrift);

  // Fetch annotation history and drift when node changes
  useEffect(() => {
    if (!selectedNodeId) return;

    // Fetch annotation history
    fetch(`http://localhost:3001/api/nodes/${encodeURIComponent(selectedNodeId)}/annotation/history`)
      .then(res => res.json())
      .then(data => {
        if (data.history) {
          setAnnotationHistory(selectedNodeId, data.history);
        }
      })
      .catch(err => console.error('Failed to fetch annotation history:', err));

    // Fetch drift info and history
    fetch(`http://localhost:3001/api/nodes/${encodeURIComponent(selectedNodeId)}/drift`)
      .then(res => res.json())
      .then(data => {
        if (data.current) {
          setNodeDrift(selectedNodeId, data.current);
        }
        if (data.history) {
          setDriftHistory(selectedNodeId, data.history);
        }
      })
      .catch(err => console.error('Failed to fetch drift:', err));
  }, [selectedNodeId, setAnnotationHistory, setDriftHistory, setNodeDrift]);

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
  const nodeDrift = selectedNodeId ? getNodeDrift(selectedNodeId) : null;
  const driftHistory = selectedNodeId ? getDriftHistory(selectedNodeId) : [];
  const annotationHistory = selectedNodeId ? getAnnotationHistory(selectedNodeId) : [];

  if (!node) {
    return (
      <div className="node-details">
        <div className="empty-state">
          <h3>Select a node</h3>
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
          {nodeDrift && (
            <span
              className={`drift-badge ${getSeverityClass(nodeDrift.severity)}`}
              title={`Drift detected: ${nodeDrift.driftType} (${nodeDrift.severity})`}
            >
              Drift
            </span>
          )}
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
            <span className="icon-copy" />
          </button>
        </div>
      </section>

      {/* HOW WE GET HERE */}
      <section className="flow-section">
        <h3 className="flow-header">How We Get Here</h3>
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
        <h3 className="flow-header">What It Does</h3>

        {/* AI Annotation */}
        {node.annotation && (
          <div className={`annotation-block ${isAnnotationStale(node.id) ? 'stale' : ''}`}>
            <div className="annotation-header">
              <span className="annotation-label">Purpose</span>
              {isAnnotationStale(node.id) && (
                <span className="stale-badge" title="Code has changed since annotation was generated">
                  Stale
                </span>
              )}
              <span className="annotation-meta">
                {formatTimeAgo(node.annotation.generatedAt)}
              </span>
            </div>
            <p className="annotation-text">{node.annotation.text}</p>
          </div>
        )}

        {/* No annotation prompt - only for functions/methods */}
        {!node.annotation && (node.kind === 'function' || node.kind === 'method') && (
          <div className="annotation-empty">
            <p className="muted">No semantic annotation. Run /annotate to generate.</p>
          </div>
        )}

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
              <span className="icon-copy" />
            </button>
          </div>
        )}

        {node.sourcePreview ? (
          <pre className="source-preview"><code>{node.sourcePreview}</code></pre>
        ) : (
          <p className="muted">No source preview available</p>
        )}

        {/* Drift alert */}
        {nodeDrift && (
          <div className={`drift-alert ${getSeverityClass(nodeDrift.severity)}`}>
            <div className="drift-header">
              <span className="drift-label">Semantic Drift Detected</span>
              <span className="drift-meta">
                {formatTimeAgoShort(nodeDrift.detectedAt)} ago
              </span>
            </div>
            <p className="drift-description">
              Code has changed since annotation was created.
              Type: <strong>{nodeDrift.driftType}</strong>,
              Severity: <strong>{nodeDrift.severity}</strong>
            </p>
          </div>
        )}

        {/* Drift History Timeline */}
        {driftHistory.length > 0 && (
          <details className="drift-history">
            <summary>
              Drift History ({driftHistory.length} events)
            </summary>
            <ul className="history-timeline">
              {driftHistory.slice(0, 5).map((event, index) => (
                <li
                  key={event.id}
                  className={`history-item ${index === 0 ? 'current' : 'past'} ${getSeverityClass(event.severity)}`}
                >
                  <div className="history-meta">
                    <span className={`drift-type-badge ${event.driftType}`}>{event.driftType}</span>
                    <span className={`severity-badge ${getSeverityClass(event.severity)}`}>{event.severity}</span>
                    <span className="history-time">
                      {formatTimeAgo(event.detectedAt)}
                    </span>
                  </div>
                  {event.resolvedAt && (
                    <p className="drift-resolved">
                      Resolved: {event.resolution || 'Annotation regenerated'}
                    </p>
                  )}
                </li>
              ))}
              {driftHistory.length > 5 && (
                <li className="history-more">
                  +{driftHistory.length - 5} more events
                </li>
              )}
            </ul>
          </details>
        )}

        {/* Annotation History Timeline */}
        {annotationHistory.length > 1 && (
          <details className="annotation-history">
            <summary>
              Annotation History ({annotationHistory.length} versions)
            </summary>
            <ul className="history-timeline">
              {annotationHistory.slice(0, 5).map((version, index) => (
                <li
                  key={version.id}
                  className={`history-item ${index === 0 ? 'current' : 'past'}`}
                >
                  <div className="history-meta">
                    <span className="history-source">{version.source}</span>
                    <span className="history-time">
                      {formatTimeAgo(version.createdAt)}
                    </span>
                  </div>
                  <p className="history-text">{version.text}</p>
                </li>
              ))}
              {annotationHistory.length > 5 && (
                <li className="history-more">
                  +{annotationHistory.length - 5} more versions
                </li>
              )}
            </ul>
          </details>
        )}
      </section>

      {/* IMPACT ANALYSIS */}
      <section className="flow-section impact-section">
        <h3 className="flow-header">Impact Analysis</h3>
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
        <h3 className="flow-header">Where It Goes ({callees.length})</h3>
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
