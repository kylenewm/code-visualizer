/**
 * Recent Changes Panel
 * Shows recently modified files/functions with timestamps
 */

import { useGraphStore } from '../lib/store';

/** Format timestamp as relative time */
function formatTimeAgo(timestamp: number): string {
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

/** Get filename from path */
function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export function RecentChanges() {
  const recentChanges = useGraphStore((s) => s.recentChanges);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const getRecentlyModifiedNodes = useGraphStore((s) => s.getRecentlyModifiedNodes);

  // Get recently modified nodes (within last 10 minutes)
  const recentNodes = getRecentlyModifiedNodes(10 * 60 * 1000);

  // Group nodes by file
  const nodesByFile = new Map<string, typeof recentNodes>();
  for (const node of recentNodes) {
    const existing = nodesByFile.get(node.filePath) || [];
    nodesByFile.set(node.filePath, [...existing, node]);
  }

  if (recentNodes.length === 0 && recentChanges.length === 0) {
    return (
      <div className="recent-changes">
        <div className="recent-changes-empty">
          <h3>No recent changes</h3>
          <p>Modified files will appear here as you work</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-changes">
      <header className="recent-changes-header">
        <h2>Recent Changes</h2>
        <span className="change-count">{recentNodes.length} functions</span>
      </header>

      <div className="recent-changes-list">
        {Array.from(nodesByFile.entries()).map(([filePath, fileNodes]) => (
          <div key={filePath} className="file-group">
            <div className="file-header">
              <span className="file-name">{getFileName(filePath)}</span>
              <span className="file-time">
                {formatTimeAgo(Math.max(...fileNodes.map(n => n.lastModified || 0)))}
              </span>
            </div>
            <ul className="function-list">
              {fileNodes.map((node) => (
                <li
                  key={node.id}
                  className="function-item"
                  onClick={() => navigateToNode(node.id)}
                >
                  <span className={`kind-dot ${node.kind}`} />
                  <span className="function-name">{node.name}</span>
                  <span className="function-time">{formatTimeAgo(node.lastModified || 0)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {recentNodes.length > 0 && (
        <div className="recent-changes-actions">
          <button
            className="view-flow-btn"
            onClick={() => {
              // Select the most recently modified exported function
              const entryPoint = recentNodes.find(n => n.exported && n.kind === 'function');
              if (entryPoint) {
                navigateToNode(entryPoint.id);
              } else if (recentNodes.length > 0) {
                navigateToNode(recentNodes[0].id);
              }
            }}
          >
            View Execution Flow →
          </button>
        </div>
      )}
    </div>
  );
}
