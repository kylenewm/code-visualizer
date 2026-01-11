/**
 * Status Bar Component
 * Shows connection status and analysis progress
 */

import { useGraphStore } from '../lib/store';

export function StatusBar() {
  const isConnected = useGraphStore((s) => s.isConnected);
  const isAnalyzing = useGraphStore((s) => s.isAnalyzing);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const functionCount = nodes.filter((n) => n.kind === 'function' || n.kind === 'method').length;
  const classCount = nodes.filter((n) => n.kind === 'class').length;

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {isAnalyzing && (
          <span className="analyzing">
            Analyzing...
          </span>
        )}
      </div>

      <div className="status-right">
        <span>{functionCount} functions</span>
        <span>{classCount} classes</span>
        <span>{edges.length} edges</span>
      </div>
    </div>
  );
}
