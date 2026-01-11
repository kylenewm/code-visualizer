/**
 * Search Bar Component
 */

import { forwardRef } from 'react';
import { useGraphStore } from '../lib/store';

export const SearchBar = forwardRef<HTMLInputElement>(function SearchBar(_props, ref) {
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const nodes = useGraphStore((s) => s.nodes);
  const filteredCount = useGraphStore((s) => s.getFilteredNodes().length);

  return (
    <div className="search-bar">
      <input
        ref={ref}
        type="text"
        placeholder="Search functions, classes... (press /)"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <span className="search-results">
          {filteredCount} / {nodes.length} nodes
        </span>
      )}
    </div>
  );
});
