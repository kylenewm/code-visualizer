/**
 * Architecture View
 * Shows module-level overview with drill-down to files and functions
 */

import { useEffect, useMemo, useState } from 'react';
import { useGraphStore, type ModuleNode, type GraphNode } from '../lib/store';
import { ModuleDiagram } from './ModuleDiagram';

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

/** Get short module name from path */
function getModuleName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Module card component */
function ModuleCard({
  module,
  isExpanded,
  onToggle,
  children,
}: {
  module: ModuleNode;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`architecture-module ${module.recentlyChanged ? 'changed' : ''}`}
      data-module-id={module.id}
    >
      <div className="module-header" onClick={onToggle}>
        <span className={`module-expand ${isExpanded ? 'icon-chevron-down' : 'icon-chevron-right'}`} />
        <div className="module-info">
          <span className="module-name">{module.name}</span>
          <span className="module-stats">
            {module.functionCount} fn{module.functionCount !== 1 ? 's' : ''}
            {module.exportedCount > 0 && ` (${module.exportedCount} exported)`}
          </span>
        </div>
        {module.recentlyChanged && (
          <span className="module-changed-badge">CHANGED</span>
        )}
        {module.lastModified && (
          <span className="module-time">{formatTimeAgo(module.lastModified)}</span>
        )}
      </div>
      {isExpanded && <div className="module-content">{children}</div>}
    </div>
  );
}

/** File row component */
function FileRow({
  fileName,
  isExpanded,
  onToggle,
  nodes,
  onSelectNode,
}: {
  fileName: string;
  isExpanded: boolean;
  onToggle: () => void;
  nodes: GraphNode[];
  onSelectNode: (nodeId: string) => void;
}) {
  const functions = nodes.filter(n => n.kind === 'function' || n.kind === 'method');
  const recentlyChanged = nodes.some(n => n.lastModified && (Date.now() - n.lastModified) < 5 * 60 * 1000);

  return (
    <div className={`architecture-file ${recentlyChanged ? 'changed' : ''}`}>
      <div className="file-header" onClick={onToggle}>
        <span className={`file-expand ${isExpanded ? 'icon-chevron-down' : 'icon-chevron-right'}`} />
        <span className="file-name">{fileName}</span>
        <span className="file-stats">{functions.length} fn{functions.length !== 1 ? 's' : ''}</span>
        {recentlyChanged && <span className="file-changed-badge">CHANGED</span>}
      </div>
      {isExpanded && (
        <div className="file-functions">
          {functions.map((fn) => (
            <div
              key={fn.id}
              className={`function-row ${fn.lastModified && (Date.now() - fn.lastModified) < 5 * 60 * 1000 ? 'changed' : ''}`}
              onClick={() => onSelectNode(fn.id)}
            >
              <span className={`kind-dot ${fn.kind}`} />
              <span className="function-name">{fn.name}</span>
              {fn.exported && <span className="exported-badge">exp</span>}
              <span className="function-lines">
                L{fn.location.startLine}-{fn.location.endLine}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchitectureView() {
  const moduleGraph = useGraphStore((s) => s.moduleGraph);
  const setModuleGraph = useGraphStore((s) => s.setModuleGraph);
  const expandedModules = useGraphStore((s) => s.expandedModules);
  const expandedFiles = useGraphStore((s) => s.expandedFiles);
  const toggleModuleExpanded = useGraphStore((s) => s.toggleModuleExpanded);
  const toggleFileExpanded = useGraphStore((s) => s.toggleFileExpanded);
  const setExpandedModules = useGraphStore((s) => s.setExpandedModules);
  const setExpandedFiles = useGraphStore((s) => s.setExpandedFiles);
  const drillDownToWalkthrough = useGraphStore((s) => s.drillDownToWalkthrough);
  const nodes = useGraphStore((s) => s.nodes);
  const isConnected = useGraphStore((s) => s.isConnected);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Expand/collapse all handlers
  const handleExpandAll = () => {
    if (!moduleGraph) return;
    const allModuleIds = new Set(moduleGraph.modules.map(m => m.id));
    const allFilePaths = new Set<string>();
    for (const module of moduleGraph.modules) {
      for (const file of module.files) {
        allFilePaths.add(`${module.path}/${file}`);
      }
    }
    setExpandedModules(allModuleIds);
    setExpandedFiles(allFilePaths);
  };

  const handleCollapseAll = () => {
    setExpandedModules(new Set());
    setExpandedFiles(new Set());
  };

  // Fetch module graph
  const fetchModuleGraph = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/modules`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setModuleGraph(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load modules';
      setError(message);
      console.error('Failed to fetch module graph:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and when connection changes
  useEffect(() => {
    if (!isConnected) return;
    fetchModuleGraph();
  }, [isConnected, setModuleGraph]);

  // Build file -> nodes mapping
  const fileNodesMap = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const existing = map.get(node.filePath) || [];
      existing.push(node);
      map.set(node.filePath, existing);
    }
    return map;
  }, [nodes]);

  // Group modules by parent directory for better organization
  const groupedModules = useMemo(() => {
    if (!moduleGraph) return new Map<string, ModuleNode[]>();

    const groups = new Map<string, ModuleNode[]>();
    for (const module of moduleGraph.modules) {
      // Get parent directory (one level up)
      const parts = module.path.split('/');
      const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';

      const existing = groups.get(parent) || [];
      existing.push(module);
      groups.set(parent, existing);
    }

    return groups;
  }, [moduleGraph]);

  if (!isConnected) {
    return (
      <div className="architecture-view">
        <div className="architecture-empty">
          <h3>Connecting...</h3>
          <p>Waiting for connection to analysis server</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="architecture-view">
        <div className="architecture-empty">
          <h3>Failed to load architecture</h3>
          <p>{error}</p>
          <button
            onClick={fetchModuleGraph}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !moduleGraph) {
    return (
      <div className="architecture-view">
        <div className="architecture-empty">
          <h3>Loading...</h3>
          <p>Fetching module architecture</p>
        </div>
      </div>
    );
  }

  if (!moduleGraph || moduleGraph.modules.length === 0) {
    return (
      <div className="architecture-view">
        <div className="architecture-empty">
          <h3>No modules found</h3>
          <p>Analyze a project to see its architecture</p>
        </div>
      </div>
    );
  }

  // Handle clicking a module in the diagram - expand it
  const handleModuleClick = (moduleId: string) => {
    if (!expandedModules.has(moduleId)) {
      toggleModuleExpanded(moduleId);
    }
    // Scroll to the module in the tree
    const element = document.querySelector(`[data-module-id="${moduleId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="architecture-view">
      <header className="architecture-header">
        <div className="architecture-title">
          <h2>Architecture</h2>
          <span className="architecture-stats">
            {moduleGraph.modules.length} modules, {nodes.length} functions
          </span>
        </div>
        <div className="architecture-actions">
          <button onClick={handleExpandAll}>Expand All</button>
          <button onClick={handleCollapseAll}>Collapse All</button>
        </div>
      </header>

      {/* Module dependency diagram */}
      <ModuleDiagram
        moduleGraph={moduleGraph}
        onModuleClick={handleModuleClick}
      />

      <div className="architecture-content">
        {Array.from(groupedModules.entries()).map(([parentPath, modules]) => (
          <div key={parentPath} className="module-group">
            {groupedModules.size > 1 && (
              <div className="module-group-header">
                {getModuleName(parentPath)}
              </div>
            )}
            {modules.map((module) => {
              const isModuleExpanded = expandedModules.has(module.id);

              return (
                <ModuleCard
                  key={module.id}
                  module={module}
                  isExpanded={isModuleExpanded}
                  onToggle={() => toggleModuleExpanded(module.id)}
                >
                  {module.files.map((fileName) => {
                    const filePath = `${module.path}/${fileName}`;
                    const isFileExpanded = expandedFiles.has(filePath);
                    const fileNodes = fileNodesMap.get(filePath) || [];

                    return (
                      <FileRow
                        key={filePath}
                        fileName={fileName}
                        isExpanded={isFileExpanded}
                        onToggle={() => toggleFileExpanded(filePath)}
                        nodes={fileNodes}
                        onSelectNode={drillDownToWalkthrough}
                      />
                    );
                  })}
                </ModuleCard>
              );
            })}
          </div>
        ))}
      </div>

      {/* Module edges info */}
      {moduleGraph.edges.length > 0 && (
        <div className="architecture-edges">
          <h3>Dependencies</h3>
          <div className="edge-list">
            {moduleGraph.edges.slice(0, 10).map((edge, i) => (
              <div key={i} className="edge-row">
                <span className="edge-source">{getModuleName(edge.source)}</span>
                <span className="edge-arrow">→</span>
                <span className="edge-target">{getModuleName(edge.target)}</span>
                <span className="edge-weight">({edge.weight} imports)</span>
              </div>
            ))}
            {moduleGraph.edges.length > 10 && (
              <div className="edge-row muted">
                +{moduleGraph.edges.length - 10} more dependencies
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
