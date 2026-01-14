# Semantic Observability System

Build a system that tracks annotation history, aggregates to module level, detects semantic drift, and eventually enforces rules via an observability agent.

## Overview

```
Phase 1: Persistence + History     (this implementation)
Phase 2: Module Rollup             (this implementation)
Phase 3: Drift Detection           (this implementation)
Phase 4: Rules + Agent             (future scope)
```

**Goal:** See what's changing over time, detect drift in real-time, understand the system as a whole as things evolve.

---

## Database Schema

```sql
-- Annotation versions (immutable history)
CREATE TABLE annotation_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('claude', 'manual')),
  created_at INTEGER NOT NULL,
  superseded_at INTEGER,
  superseded_by INTEGER REFERENCES annotation_versions(id)
);

-- Module-level annotations
CREATE TABLE module_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_path TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  function_count INTEGER NOT NULL,
  content_hashes TEXT NOT NULL,  -- JSON array
  created_at INTEGER NOT NULL,
  superseded_at INTEGER
);

-- Drift events
CREATE TABLE drift_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  old_content_hash TEXT NOT NULL,
  new_content_hash TEXT NOT NULL,
  old_annotation_id INTEGER REFERENCES annotation_versions(id),
  detected_at INTEGER NOT NULL,
  drift_type TEXT CHECK(drift_type IN ('implementation', 'semantic', 'unknown')),
  severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
  resolved_at INTEGER,
  resolution TEXT
);
```

---

## Phase 1: Persistence + History

### Files to Create

**`src/storage/sqlite.ts`** - Database connection + schema
```typescript
// initDatabase(dbPath) - Create tables if not exist
// getDb() - Return connection
// transaction(fn) - Atomic write wrapper
```

**`src/storage/annotation-store.ts`** - Annotation CRUD
```typescript
// saveAnnotation(nodeId, text, contentHash, source) -> versionId
// getHistory(nodeId) -> AnnotationVersion[]
// getCurrent(nodeId) -> AnnotationVersion | null
// loadAllCurrent() -> Map<nodeId, annotation>
```

### Files to Modify

**`src/server/express.ts`**
- Wire storage to POST `/api/nodes/:id/annotation`
- Add `GET /api/nodes/:id/annotation/history`
- Load annotations into graph on startup

**`src/index.ts`**
- Initialize SQLite on startup
- Load persisted annotations into graph

### New Types (`src/types/index.ts`)

```typescript
interface AnnotationVersion {
  id: number;
  nodeId: string;
  text: string;
  contentHash: string;
  source: 'claude' | 'manual';
  createdAt: number;
  supersededAt?: number;
}
```

---

## Phase 2: Module Rollup

### Files to Create

**`src/storage/module-store.ts`** - Module annotation persistence

**`src/analyzer/module-summarizer.ts`** - Aggregation logic
```typescript
// summarizeModule(modulePath, functionAnnotations[]) -> summary
// Uses Claude to generate 3-5 sentence module summary from function annotations
```

### Files to Modify

**`src/server/express.ts`**
- `GET /api/modules/:path/annotation` - Get module summary
- `POST /api/modules/:path/annotation/regenerate` - Trigger re-aggregation

**`src/graph/graph.ts`**
- Extend `getModuleGraph()` to include annotation status

### Extended ModuleNode

```typescript
interface ModuleNode {
  // ...existing
  annotation?: {
    summary: string;
    functionsCovered: number;
    functionsTotal: number;
    generatedAt: number;
    stale: boolean;
  };
}
```

---

## Phase 3: Drift Detection

### Files to Create

**`src/analyzer/drift-detector.ts`**
```typescript
// detectDrift(nodeId, oldHash, newHash, annotation) -> DriftEvent
// Drift types:
//   - 'implementation': Small changes, intent preserved
//   - 'semantic': Major structural change
//   - 'unknown': Needs review
// Severity:
//   - low: <20% lines changed, signature same
//   - medium: 20-50% changed OR signature changed
//   - high: >50% changed OR structural change
```

**`src/storage/drift-store.ts`** - Drift event persistence

### Files to Modify

**`src/hooks/change-aggregator.ts`**
- After analysis, check for drift on affected nodes
- Emit `drift:detected` WebSocket event

**`src/server/express.ts`**
- `GET /api/drift` - List unresolved drift
- `GET /api/drift/summary` - Statistics
- `POST /api/drift/:id/resolve` - Mark resolved

### Frontend

**`web/src/components/NodeDetails.tsx`**
- Drift indicator badge
- History timeline view

---

## Phase 4: Rules + Agent (Future)

Deferred but architecture supports:

```typescript
interface ObservabilityRule {
  id: string;
  name: string;
  condition: 'missing_annotation' | 'stale' | 'high_drift' | 'uncovered_module';
  threshold?: number;
  action: 'warn' | 'block' | 'auto_regenerate';
  enabled: boolean;
}
```

---

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `src/storage/sqlite.ts` | Create | 1 |
| `src/storage/annotation-store.ts` | Create | 1 |
| `src/storage/module-store.ts` | Create | 2 |
| `src/storage/drift-store.ts` | Create | 3 |
| `src/analyzer/module-summarizer.ts` | Create | 2 |
| `src/analyzer/drift-detector.ts` | Create | 3 |
| `src/types/index.ts` | Modify | 1,2,3 |
| `src/index.ts` | Modify | 1 |
| `src/server/express.ts` | Modify | 1,2,3 |
| `src/graph/graph.ts` | Modify | 2 |
| `src/hooks/change-aggregator.ts` | Modify | 3 |
| `web/src/components/NodeDetails.tsx` | Modify | 3 |

---

## Verification

1. **Phase 1**: Stop/restart server, verify annotations persist
2. **Phase 2**: Run `/annotate` on module, then generate module summary, verify aggregation
3. **Phase 3**: Change annotated function body, verify drift event appears in UI
4. **All phases**: Run `npm test`, verify no regressions
