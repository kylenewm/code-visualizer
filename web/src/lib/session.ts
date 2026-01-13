/**
 * Session persistence hook
 * Saves and restores UI state from localStorage
 */

import { useEffect, useRef } from 'react';
import { useGraphStore } from './store';

const SESSION_KEY = 'codeflow-session';

interface SessionState {
  selectedNodeId: string | null;
  searchQuery: string;
  navigationHistory: string[];
  expandedModules: string[];
  expandedFiles: string[];
}

export function useSessionPersistence() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const navigationHistory = useGraphStore((s) => s.navigationHistory);
  const expandedModules = useGraphStore((s) => s.expandedModules);
  const expandedFiles = useGraphStore((s) => s.expandedFiles);
  const nodes = useGraphStore((s) => s.nodes);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const setExpandedModules = useGraphStore((s) => s.setExpandedModules);
  const setExpandedFiles = useGraphStore((s) => s.setExpandedFiles);

  // Track if we've already attempted restoration (prevents multiple restores)
  const hasRestoredRef = useRef(false);

  // Restore session on mount (only once when nodes are loaded)
  useEffect(() => {
    // Only restore once, and only when nodes are loaded
    if (hasRestoredRef.current || nodes.length === 0) return;
    hasRestoredRef.current = true;

    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return;

      const session: SessionState = JSON.parse(saved);

      // Only restore selectedNodeId if the node still exists
      if (session.selectedNodeId) {
        const nodeExists = nodes.some((n) => n.id === session.selectedNodeId);
        if (nodeExists) {
          setSelectedNode(session.selectedNodeId);
        }
      }

      // Restore search query
      if (session.searchQuery) {
        setSearchQuery(session.searchQuery);
      }

      // Restore expansion state
      if (session.expandedModules?.length) {
        setExpandedModules(new Set(session.expandedModules));
      }
      if (session.expandedFiles?.length) {
        setExpandedFiles(new Set(session.expandedFiles));
      }
    } catch (error) {
      console.warn('Failed to restore session:', error);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [nodes.length, setSelectedNode, setSearchQuery, setExpandedModules, setExpandedFiles]);

  // Save session on changes (debounced)
  useEffect(() => {
    if (nodes.length === 0) return; // Don't save empty state

    const timeoutId = setTimeout(() => {
      const session: SessionState = {
        selectedNodeId,
        searchQuery,
        navigationHistory,
        expandedModules: Array.from(expandedModules),
        expandedFiles: Array.from(expandedFiles),
      };

      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (error) {
        console.warn('Failed to save session:', error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [selectedNodeId, searchQuery, navigationHistory, expandedModules, expandedFiles, nodes.length]);
}
