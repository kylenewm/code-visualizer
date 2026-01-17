/**
 * Drift Store
 * Handles persistence for semantic drift detection events
 */

import { getDatabase } from './sqlite.js';
import type { DriftType, DriftSeverity } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface DriftEvent {
  id: number;
  nodeId: string;
  stableId: string;
  oldContentHash: string;
  newContentHash: string;
  oldAnnotationId?: number;
  detectedAt: number;
  driftType: DriftType;
  severity: DriftSeverity;
  resolvedAt?: number;
  resolution?: string;
  /** Whether the concept/purpose shifted (null = not checked, true = shifted, false = same) */
  conceptShifted?: boolean | null;
  /** Explanation of what conceptually changed */
  shiftReason?: string | null;
  /** Semantic similarity score (0-1) from embedding comparison */
  semanticSimilarity?: number | null;
}

export interface DriftEventInput {
  nodeId: string;
  stableId: string;
  oldContentHash: string;
  newContentHash: string;
  oldAnnotationId?: number;
  driftType: DriftType;
  severity: DriftSeverity;
}

export interface DriftStats {
  total: number;
  unresolved: number;
  resolvedToday: number;
  bySeverity: Record<DriftSeverity, number>;
  byType: Record<DriftType, number>;
}

// ============================================
// Drift Store
// ============================================

export class DriftStore {
  /**
   * Record a new drift event
   */
  recordDrift(input: DriftEventInput): number {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO drift_events
      (node_id, stable_id, old_content_hash, new_content_hash, old_annotation_id, detected_at, drift_type, severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.nodeId,
      input.stableId,
      input.oldContentHash,
      input.newContentHash,
      input.oldAnnotationId ?? null,
      now,
      input.driftType,
      input.severity
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get a specific drift event
   */
  getDriftEvent(id: number): DriftEvent | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE id = ?
    `);

    return stmt.get(id) as DriftEvent | null;
  }

  /**
   * Get all drift events for a node (by stableId)
   */
  getNodeDrift(stableId: string): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE stable_id = ?
      ORDER BY detected_at DESC
    `);

    return stmt.all(stableId) as DriftEvent[];
  }

  /**
   * Get unresolved drift for a node (by stableId)
   */
  getUnresolvedNodeDrift(stableId: string): DriftEvent | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE stable_id = ? AND resolved_at IS NULL
      ORDER BY detected_at DESC
      LIMIT 1
    `);

    return stmt.get(stableId) as DriftEvent | null;
  }

  /**
   * Get all unresolved drift events
   */
  getUnresolved(limit: number = 100): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE resolved_at IS NULL
      ORDER BY
        CASE severity
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        detected_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as DriftEvent[];
  }

  /**
   * Get unresolved drift by severity
   */
  getUnresolvedBySeverity(severity: DriftSeverity, limit: number = 50): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE resolved_at IS NULL AND severity = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `);

    return stmt.all(severity, limit) as DriftEvent[];
  }

  /**
   * Resolve a drift event
   */
  resolveDrift(id: number, resolution: string): boolean {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE drift_events
      SET resolved_at = ?, resolution = ?
      WHERE id = ? AND resolved_at IS NULL
    `);

    const result = stmt.run(now, resolution, id);
    return result.changes > 0;
  }

  /**
   * Resolve all drift for a node by stableId (e.g., when annotation is regenerated)
   */
  resolveNodeDrift(stableId: string, resolution: string): number {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE drift_events
      SET resolved_at = ?, resolution = ?
      WHERE stable_id = ? AND resolved_at IS NULL
    `);

    const result = stmt.run(now, resolution, stableId);
    return result.changes;
  }

  /**
   * Get drift statistics
   */
  getStats(): DriftStats {
    const db = getDatabase();

    // Total
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM drift_events');
    const total = (totalStmt.get() as { count: number }).count;

    // Unresolved
    const unresolvedStmt = db.prepare(
      'SELECT COUNT(*) as count FROM drift_events WHERE resolved_at IS NULL'
    );
    const unresolved = (unresolvedStmt.get() as { count: number }).count;

    // Resolved today
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const resolvedTodayStmt = db.prepare(
      'SELECT COUNT(*) as count FROM drift_events WHERE resolved_at >= ?'
    );
    const resolvedToday = (resolvedTodayStmt.get(todayStart) as { count: number }).count;

    // By severity (unresolved only)
    const bySeverityStmt = db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM drift_events
      WHERE resolved_at IS NULL
      GROUP BY severity
    `);
    const bySeverityRows = bySeverityStmt.all() as Array<{ severity: DriftSeverity; count: number }>;
    const bySeverity: Record<DriftSeverity, number> = { low: 0, medium: 0, high: 0 };
    for (const row of bySeverityRows) {
      bySeverity[row.severity] = row.count;
    }

    // By type (unresolved only)
    const byTypeStmt = db.prepare(`
      SELECT drift_type as driftType, COUNT(*) as count
      FROM drift_events
      WHERE resolved_at IS NULL
      GROUP BY drift_type
    `);
    const byTypeRows = byTypeStmt.all() as Array<{ driftType: DriftType; count: number }>;
    const byType: Record<DriftType, number> = { implementation: 0, semantic: 0, unknown: 0 };
    for (const row of byTypeRows) {
      byType[row.driftType] = row.count;
    }

    return {
      total,
      unresolved,
      resolvedToday,
      bySeverity,
      byType,
    };
  }

  /**
   * Get recent drift events (resolved and unresolved)
   */
  getRecent(limit: number = 20): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      ORDER BY detected_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as DriftEvent[];
  }

  /**
   * Get drift events in a time range
   */
  getInTimeRange(startMs: number, endMs: number): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE detected_at >= ? AND detected_at <= ?
      ORDER BY detected_at DESC
    `);

    return stmt.all(startMs, endMs) as DriftEvent[];
  }

  /**
   * Check if a node has active unresolved drift (by stableId)
   */
  hasUnresolvedDrift(stableId: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 1 FROM drift_events
      WHERE stable_id = ? AND resolved_at IS NULL
      LIMIT 1
    `);
    return stmt.get(stableId) !== undefined;
  }

  /**
   * Get stableIds with unresolved drift
   */
  getNodesWithDrift(): string[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT stable_id as stableId
      FROM drift_events
      WHERE resolved_at IS NULL
    `);

    const rows = stmt.all() as Array<{ stableId: string }>;
    return rows.map(r => r.stableId);
  }

  /**
   * Delete all drift for a node (by stableId)
   */
  deleteNodeDrift(stableId: string): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM drift_events WHERE stable_id = ?');
    const result = stmt.run(stableId);
    return result.changes;
  }

  /**
   * Update concept shift detection result on a drift event
   */
  updateConceptShift(driftId: number, shifted: boolean, reason?: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE drift_events
      SET concept_shifted = ?, shift_reason = ?
      WHERE id = ?
    `);

    const result = stmt.run(shifted ? 1 : 0, reason ?? null, driftId);
    return result.changes > 0;
  }

  /**
   * Update semantic similarity score on a drift event
   */
  updateSemanticSimilarity(driftId: number, similarity: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE drift_events
      SET semantic_similarity = ?
      WHERE id = ?
    `);

    const result = stmt.run(similarity, driftId);
    return result.changes > 0;
  }

  /**
   * Get drift events with concept shifts
   */
  getConceptShifts(limit: number = 50): DriftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        old_content_hash as oldContentHash,
        new_content_hash as newContentHash,
        old_annotation_id as oldAnnotationId,
        detected_at as detectedAt,
        drift_type as driftType,
        severity,
        resolved_at as resolvedAt,
        resolution,
        concept_shifted as conceptShifted,
        shift_reason as shiftReason,
        semantic_similarity as semanticSimilarity
      FROM drift_events
      WHERE concept_shifted = 1
      ORDER BY detected_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as DriftEvent[];
  }

  /**
   * Get count of concept shifts
   */
  getConceptShiftCount(): number {
    const db = getDatabase();
    const stmt = db.prepare(
      'SELECT COUNT(*) as count FROM drift_events WHERE concept_shifted = 1'
    );
    return (stmt.get() as { count: number }).count;
  }
}

// ============================================
// Singleton
// ============================================

let instance: DriftStore | null = null;

export function getDriftStore(): DriftStore {
  if (!instance) {
    instance = new DriftStore();
  }
  return instance;
}
