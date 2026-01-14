/**
 * Annotation Store
 * Handles CRUD operations for semantic annotations with full version history
 */

import { getDatabase } from './sqlite.js';

// ============================================
// Types
// ============================================

export interface AnnotationVersion {
  id: number;
  nodeId: string;
  stableId: string;
  contentHash: string;
  text: string;
  source: 'claude' | 'manual';
  createdAt: number;
  supersededAt?: number;
  supersededBy?: number;
}

export interface AnnotationSummary {
  nodeId: string;
  currentVersion: AnnotationVersion;
  versionCount: number;
  isStale: boolean;
}

export interface SaveAnnotationResult {
  versionId: number;
  supersededId?: number;
  isNew: boolean;
}

// ============================================
// Annotation Store
// ============================================

export class AnnotationStore {
  /**
   * Save a new annotation, superseding any existing one for this node
   * Uses stableId for lookups to survive signature changes
   */
  saveAnnotation(
    nodeId: string,
    stableId: string,
    text: string,
    contentHash: string,
    source: 'claude' | 'manual'
  ): SaveAnnotationResult {
    const db = getDatabase();
    const now = Date.now();

    return db.transaction(() => {
      // Find current active annotation by stable_id (survives signature changes)
      const currentStmt = db.prepare(`
        SELECT id FROM annotation_versions
        WHERE stable_id = ? AND superseded_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const current = currentStmt.get(stableId) as { id: number } | undefined;

      // Insert new annotation with both IDs
      const insertStmt = db.prepare(`
        INSERT INTO annotation_versions
        (node_id, stable_id, content_hash, text, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(nodeId, stableId, contentHash, text, source, now);
      const newId = result.lastInsertRowid as number;

      // Mark previous as superseded
      if (current) {
        const supersedingStmt = db.prepare(`
          UPDATE annotation_versions
          SET superseded_at = ?, superseded_by = ?
          WHERE id = ?
        `);
        supersedingStmt.run(now, newId, current.id);
      }

      return {
        versionId: newId,
        supersededId: current?.id,
        isNew: !current,
      };
    });
  }

  /**
   * Get the full history of annotations for a node (by stableId)
   */
  getHistory(stableId: string): AnnotationVersion[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE stable_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(stableId) as AnnotationVersion[];
  }

  /**
   * Get the current (active) annotation for a node (by stableId)
   */
  getCurrent(stableId: string): AnnotationVersion | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE stable_id = ? AND superseded_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const result = stmt.get(stableId) as AnnotationVersion | undefined;
    return result ?? null;
  }

  /**
   * Get a specific annotation version by ID
   */
  getVersion(versionId: number): AnnotationVersion | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE id = ?
    `);

    const result = stmt.get(versionId) as AnnotationVersion | undefined;
    return result ?? null;
  }

  /**
   * Load all current annotations as a map (keyed by stableId for stable lookup)
   */
  loadAllCurrent(): Map<string, AnnotationVersion> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE superseded_at IS NULL
      ORDER BY stable_id
    `);

    const results = stmt.all() as AnnotationVersion[];
    const map = new Map<string, AnnotationVersion>();

    for (const annotation of results) {
      // Key by stableId for stable lookup across signature changes
      map.set(annotation.stableId, annotation);
    }

    return map;
  }

  /**
   * Get annotations that are stale (content hash mismatch)
   * Uses stableId for matching
   */
  getStaleAnnotations(currentHashes: Map<string, string>): AnnotationSummary[] {
    const allCurrent = this.loadAllCurrent();
    const stale: AnnotationSummary[] = [];

    for (const [stableId, annotation] of allCurrent) {
      const currentHash = currentHashes.get(stableId);
      if (currentHash && currentHash !== annotation.contentHash) {
        const versionCount = this.getVersionCount(stableId);
        stale.push({
          nodeId: annotation.nodeId,
          currentVersion: annotation,
          versionCount,
          isStale: true,
        });
      }
    }

    return stale;
  }

  /**
   * Get the number of versions for a node (by stableId)
   */
  getVersionCount(stableId: string): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM annotation_versions WHERE stable_id = ?
    `);
    const result = stmt.get(stableId) as { count: number };
    return result.count;
  }

  /**
   * Delete all annotations for a node (by stableId)
   */
  deleteNodeAnnotations(stableId: string): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM annotation_versions WHERE stable_id = ?');
    const result = stmt.run(stableId);
    return result.changes;
  }

  /**
   * Get annotation statistics
   */
  getStats(): {
    totalAnnotations: number;
    totalVersions: number;
    nodesWithAnnotations: number;
    annotationsBySource: Record<string, number>;
  } {
    const db = getDatabase();

    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM annotation_versions WHERE superseded_at IS NULL
    `);
    const totalAnnotations = (totalStmt.get() as { count: number }).count;

    const versionsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM annotation_versions
    `);
    const totalVersions = (versionsStmt.get() as { count: number }).count;

    const nodesStmt = db.prepare(`
      SELECT COUNT(DISTINCT node_id) as count FROM annotation_versions
    `);
    const nodesWithAnnotations = (nodesStmt.get() as { count: number }).count;

    const bySourceStmt = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM annotation_versions
      WHERE superseded_at IS NULL
      GROUP BY source
    `);
    const bySource = bySourceStmt.all() as Array<{ source: string; count: number }>;
    const annotationsBySource: Record<string, number> = {};
    for (const row of bySource) {
      annotationsBySource[row.source] = row.count;
    }

    return {
      totalAnnotations,
      totalVersions,
      nodesWithAnnotations,
      annotationsBySource,
    };
  }

  /**
   * Get recently updated annotations
   */
  getRecent(limit: number = 20): AnnotationVersion[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE superseded_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as AnnotationVersion[];
  }

  /**
   * Bulk save annotations (for batch operations)
   */
  bulkSave(
    annotations: Array<{
      nodeId: string;
      stableId: string;
      text: string;
      contentHash: string;
      source: 'claude' | 'manual';
    }>
  ): SaveAnnotationResult[] {
    const results: SaveAnnotationResult[] = [];

    for (const annotation of annotations) {
      const result = this.saveAnnotation(
        annotation.nodeId,
        annotation.stableId,
        annotation.text,
        annotation.contentHash,
        annotation.source
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Check if annotation exists for a node (by stableId)
   */
  hasAnnotation(stableId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 1 FROM annotation_versions
      WHERE stable_id = ? AND superseded_at IS NULL
      LIMIT 1
    `);
    return stmt.get(stableId) !== undefined;
  }

  /**
   * Get annotations created within a time range
   */
  getInTimeRange(startMs: number, endMs: number): AnnotationVersion[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        content_hash as contentHash,
        text,
        source,
        created_at as createdAt,
        superseded_at as supersededAt,
        superseded_by as supersededBy
      FROM annotation_versions
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `);

    return stmt.all(startMs, endMs) as AnnotationVersion[];
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: AnnotationStore | null = null;

export function getAnnotationStore(): AnnotationStore {
  if (!instance) {
    instance = new AnnotationStore();
  }
  return instance;
}
