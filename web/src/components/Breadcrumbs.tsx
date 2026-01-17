/**
 * Breadcrumb navigation trail
 * Shows navigation history and allows backtracking
 */

import { useGraphStore } from '../lib/store';

export function Breadcrumbs() {
  const navigationHistory = useGraphStore((s) => s.navigationHistory);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const getNode = useGraphStore((s) => s.getNode);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const navigateBack = useGraphStore((s) => s.navigateBack);
  const clearHistory = useGraphStore((s) => s.clearHistory);

  // Build breadcrumb items
  const items = navigationHistory.map((nodeId) => {
    const node = getNode(nodeId);
    return { id: nodeId, name: node?.name ?? nodeId };
  });

  // Add current selection if not already the last item
  if (selectedNodeId && items[items.length - 1]?.id !== selectedNodeId) {
    const currentNode = getNode(selectedNodeId);
    items.push({
      id: selectedNodeId,
      name: currentNode?.name ?? selectedNodeId,
    });
  }

  if (items.length === 0) {
    return null;
  }

  // Only show last 5 items
  const visibleItems = items.slice(-5);
  const hasMore = items.length > 5;

  return (
    <div className="breadcrumbs">
      {navigationHistory.length > 0 && (
        <button
          className="breadcrumb-back"
          onClick={navigateBack}
          title="Go Back"
        >
          ‹
        </button>
      )}

      {hasMore && <span className="breadcrumb-ellipsis">...</span>}

      {visibleItems.map((item, index) => {
        const isLast = index === visibleItems.length - 1;
        const isClickable = !isLast;

        return (
          <span key={`${item.id}-${index}`} className="breadcrumb-item-wrapper">
            <span
              className={`breadcrumb-item ${isLast ? 'current' : ''} ${isClickable ? 'clickable' : ''}`}
              onClick={() => isClickable && navigateToNode(item.id)}
            >
              {item.name}
            </span>
            {!isLast && <span className="breadcrumb-separator">/</span>}
          </span>
        );
      })}

      {items.length > 1 && (
        <button
          className="breadcrumb-clear"
          onClick={clearHistory}
          title="Clear History"
        >
          ×
        </button>
      )}
    </div>
  );
}
