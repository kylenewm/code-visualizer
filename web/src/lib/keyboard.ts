/**
 * Keyboard shortcuts hook
 */

import { useEffect, type RefObject } from 'react';
import { useGraphStore } from './store';
import type { GraphHandle } from '../components/Graph';

interface KeyboardShortcutsOptions {
  searchInputRef: RefObject<HTMLInputElement | null>;
  graphRef: RefObject<GraphHandle | null>;
}

export function useKeyboardShortcuts({
  searchInputRef,
  graphRef,
}: KeyboardShortcutsOptions) {
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const navigateBack = useGraphStore((s) => s.navigateBack);
  const navigationHistory = useGraphStore((s) => s.navigationHistory);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Escape always works - clears selection and search
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedNode(null);
        setSearchQuery('');
        if (isInputFocused) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // Don't handle shortcuts if typing in input (except Escape)
      if (isInputFocused) {
        return;
      }

      switch (event.key) {
        case '/':
          // Focus search
          event.preventDefault();
          searchInputRef.current?.focus();
          break;

        case 'f':
        case 'F':
          // Toggle focus mode
          event.preventDefault();
          graphRef.current?.toggleFocusMode();
          break;

        case '+':
        case '=':
          // Zoom in
          event.preventDefault();
          graphRef.current?.zoomIn();
          break;

        case '-':
        case '_':
          // Zoom out
          event.preventDefault();
          graphRef.current?.zoomOut();
          break;

        case '0':
          // Reset zoom
          event.preventDefault();
          graphRef.current?.resetZoom();
          break;

        case 'Home':
          // Fit to screen
          event.preventDefault();
          graphRef.current?.fitToScreen();
          break;

        case 'Backspace':
          // Navigate back
          if (navigationHistory.length > 0) {
            event.preventDefault();
            navigateBack();
          }
          break;

        case '1':
        case '2':
        case '3':
          // Set focus depth (when in focus mode)
          event.preventDefault();
          graphRef.current?.setFocusDepth(parseInt(event.key));
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    searchInputRef,
    graphRef,
    setSelectedNode,
    setSearchQuery,
    navigateBack,
    navigationHistory.length,
  ]);
}
