/**
 * Change Feed Component
 * Shows recent file changes with expandable git diffs
 */

import { useState, useEffect } from 'react';
import { useGraphStore, type ChangeEvent } from '../lib/store';

const API_BASE = 'http://localhost:3001/api';

/** Format relative time */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Parse diff into lines with styling info */
interface DiffLine {
  content: string;
  type: 'context' | 'add' | 'remove' | 'header';
}

function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      lines.push({ content: line, type: 'header' });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ content: line, type: 'add' });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ content: line, type: 'remove' });
    } else if (!line.startsWith('diff ') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++')) {
      lines.push({ content: line, type: 'context' });
    }
  }
  return lines;
}

/** Single change event card */
function ChangeCard({
  event,
  isExpanded,
  onToggle,
  onFunctionClick,
}: {
  event: ChangeEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onFunctionClick: (functionName: string) => void;
}) {
  const diffLines = event.diff ? parseDiff(event.diff) : [];
  const hasExpandableContent = event.diff && diffLines.length > 0;

  return (
    <div className={`change-card ${event.type}`}>
      <div className="change-card-header" onClick={hasExpandableContent ? onToggle : undefined}>
        {hasExpandableContent && (
          <span className={`change-expand ${isExpanded ? 'icon-chevron-down' : 'icon-chevron-right'}`} />
        )}
        <span className={`change-type-badge ${event.type}`}>
          {event.type === 'create' ? 'NEW' : event.type === 'delete' ? 'DEL' : 'MOD'}
        </span>
        <span className="change-file-name">{event.fileName}</span>
        <span className="change-summary">
          {event.summary}
          {event.linesAdded > 0 && <span className="lines-added">+{event.linesAdded}</span>}
          {event.linesRemoved > 0 && <span className="lines-removed">-{event.linesRemoved}</span>}
        </span>
        <span className="change-time">{formatTimeAgo(event.timestamp)}</span>
      </div>

      {/* Affected functions */}
      {event.affectedFunctions.length > 0 && (
        <div className="change-functions">
          {event.affectedFunctions.map((fn, i) => (
            <button
              key={i}
              className="affected-function"
              onClick={(e) => {
                e.stopPropagation();
                onFunctionClick(fn);
              }}
            >
              {fn}()
            </button>
          ))}
        </div>
      )}

      {/* Expandable diff */}
      {isExpanded && hasExpandableContent && (
        <div className="change-diff">
          <pre>
            {diffLines.map((line, i) => (
              <div key={i} className={`diff-line ${line.type}`}>
                {line.content}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ChangeFeed() {
  const changeEvents = useGraphStore((s) => s.changeEvents);
  const setChangeEvents = useGraphStore((s) => s.setChangeEvents);
  const isConnected = useGraphStore((s) => s.isConnected);
  const nodes = useGraphStore((s) => s.nodes);
  const drillDownToWalkthrough = useGraphStore((s) => s.drillDownToWalkthrough);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Fetch initial change history on mount
  useEffect(() => {
    if (!isConnected) return;

    const fetchChanges = async () => {
      try {
        const res = await fetch(`${API_BASE}/changes?limit=50`);
        if (res.ok) {
          const data = await res.json();
          setChangeEvents(data.changes);
        }
      } catch (err) {
        console.error('Failed to fetch change history:', err);
      }
    };

    fetchChanges();
  }, [isConnected, setChangeEvents]);

  // Toggle diff expansion
  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Drill down to walkthrough when clicking a function
  const handleFunctionClick = (functionName: string) => {
    // Find the node by name
    const node = nodes.find(n =>
      n.name === functionName &&
      (n.kind === 'function' || n.kind === 'method')
    );
    if (node) {
      drillDownToWalkthrough(node.id);
    }
  };

  if (!isConnected) {
    return (
      <div className="change-feed">
        <div className="change-feed-empty">
                    <h3>Connecting...</h3>
          <p>Waiting for connection to analysis server</p>
        </div>
      </div>
    );
  }

  if (changeEvents.length === 0) {
    return (
      <div className="change-feed">
        <header className="change-feed-header">
          <h2>Change Feed</h2>
        </header>
        <div className="change-feed-empty">
                    <h3>No changes yet</h3>
          <p>Changes will appear here as files are modified</p>
        </div>
      </div>
    );
  }

  return (
    <div className="change-feed">
      <header className="change-feed-header">
        <h2>Change Feed</h2>
        <span className="change-feed-count">{changeEvents.length} changes</span>
      </header>

      <div className="change-feed-content">
        {changeEvents.map((event) => (
          <ChangeCard
            key={event.id}
            event={event}
            isExpanded={expandedIds.has(event.id)}
            onToggle={() => handleToggle(event.id)}
            onFunctionClick={handleFunctionClick}
          />
        ))}
      </div>
    </div>
  );
}
