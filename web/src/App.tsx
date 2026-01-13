/**
 * CodeFlow Visualizer - Main App Component
 */

import { useRef, useState, useEffect } from 'react';
import { useWebSocket } from './lib/websocket';
import { useGraphStore } from './lib/store';
import { Graph, type GraphHandle } from './components/Graph';
import { NodeDetails } from './components/NodeDetails';
import { SearchBar } from './components/SearchBar';
import { StatusBar } from './components/StatusBar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { ChangeFeed } from './components/ChangeFeed';
import { CallTreeView } from './components/CallTreeView';
import { ArchitectureView } from './components/ArchitectureView';
import { WelcomeModal, useWelcomeModal } from './components/WelcomeModal';
import { useKeyboardShortcuts } from './lib/keyboard';
import { useSessionPersistence } from './lib/session';
import './App.css';

type ViewMode = 'architecture' | 'recent' | 'walkthrough' | 'graph';

function App() {
  // View mode state - Architecture is the default (v2)
  const [viewMode, setViewMode] = useState<ViewMode>('architecture');

  // Welcome modal state
  const { showWelcome, openWelcome, closeWelcome } = useWelcomeModal();

  // Connection state for disconnect banner
  const isConnected = useGraphStore((s) => s.isConnected);

  // Get drill-down state from store
  const requestedView = useGraphStore((s) => s.requestedView);
  const clearRequestedView = useGraphStore((s) => s.clearRequestedView);

  // Handle drill-down view switching
  useEffect(() => {
    if (requestedView) {
      setViewMode(requestedView);
      clearRequestedView();
    }
  }, [requestedView, clearRequestedView]);

  // Connect to WebSocket for real-time updates
  useWebSocket();

  // Persist session state to localStorage
  useSessionPersistence();

  // Refs for keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef<GraphHandle>(null);

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    searchInputRef,
    graphRef,
    onHelpRequest: openWelcome,
    onViewChange: setViewMode,
  });

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>CodeFlow Visualizer</h1>
          <button
            className="help-button"
            onClick={openWelcome}
            title="Help & Shortcuts (?)"
          >
            ?
          </button>
          <Breadcrumbs />
        </div>
        <div className="header-center">
          <div className="view-tabs">
            <button
              className={`view-tab ${viewMode === 'architecture' ? 'active' : ''}`}
              onClick={() => setViewMode('architecture')}
            >
              Architecture
            </button>
            <button
              className={`view-tab ${viewMode === 'recent' ? 'active' : ''}`}
              onClick={() => setViewMode('recent')}
            >
              Changes
            </button>
            <button
              className={`view-tab ${viewMode === 'walkthrough' ? 'active' : ''}`}
              onClick={() => setViewMode('walkthrough')}
            >
              Walkthrough
            </button>
            <button
              className={`view-tab ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              Graph
            </button>
          </div>
        </div>
        <SearchBar ref={searchInputRef} />
      </header>

      {/* Disconnection Banner */}
      {!isConnected && (
        <div className="disconnect-banner">
          <span className="disconnect-icon">⚠️</span>
          <span>Connection lost - data may be stale. Reconnecting...</span>
        </div>
      )}

      <main className="app-main">
        <div className="main-panel">
          {viewMode === 'architecture' && <ArchitectureView />}
          {viewMode === 'recent' && <ChangeFeed />}
          {viewMode === 'walkthrough' && <CallTreeView />}
          {viewMode === 'graph' && <Graph ref={graphRef} />}
        </div>
        <aside className="details-panel">
          <NodeDetails />
        </aside>
      </main>

      <StatusBar />

      {/* Keyboard hints - simplified */}
      <div className="keyboard-hints">
        <kbd>/</kbd> Search
        <kbd>F</kbd> Focus
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> Views
        <kbd>?</kbd> Help
      </div>

      {/* Welcome Modal */}
      {showWelcome && <WelcomeModal onClose={closeWelcome} />}
    </div>
  );
}

export default App;
