/**
 * Touched Functions Store
 * Tracks functions that have been edited and need annotation review
 */

import { getDatabase } from './sqlite.js';

// ============================================
// Types
// ============================================

export interface TouchedFunction {
  id: number;
  stableId: string;
  filePath: string;
  touchedAt: number;
  changeId: string | null;
  annotatedAt: number | null;
}

export interface TouchedStats {
  pending: number;
  annotated: number;
  total: number;
}

// ============================================
// Touched Functions Store
// ============================================

export class TouchedFunctionsStore {
  /**
   * Mark a function as touched (edited)
   * Uses INSERT OR REPLACE to update if same stableId touched again
   */
  markTouched(stableId: string, filePath: string, changeId?: string): number {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO touched_functions (stable_id, file_path, touched_at, change_id, annotated_at)
      VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(stable_id, touched_at) DO UPDATE SET
        file_path = excluded.file_path,
        change_id = excluded.change_id
    `);

    const result = stmt.run(stableId, filePath, now, changeId ?? null);
    return result.lastInsertRowid as number;
  }

  /**
   * Get all pending (unannotated) touched functions
   */
  getPending(limit?: number): TouchedFunction[] {
    const db = getDatabase();
    const sql = limit
      ? `SELECT id, stable_id as stableId, file_path as filePath, touched_at as touchedAt,
                change_id as changeId, annotated_at as annotatedAt
         FROM touched_functions
         WHERE annotated_at IS NULL
         ORDER BY touched_at DESC
         LIMIT ?`
      : `SELECT id, stable_id as stableId, file_path as filePath, touched_at as touchedAt,
                change_id as changeId, annotated_at as annotatedAt
         FROM touched_functions
         WHERE annotated_at IS NULL
         ORDER BY touched_at DESC`;

    const stmt = db.prepare(sql);
    return (limit ? stmt.all(limit) : stmt.all()) as TouchedFunction[];
  }

  /**
   * Mark a function as annotated (clears from pending queue)
   */
  markAnnotated(stableId: string): boolean {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE touched_functions
      SET annotated_at = ?
      WHERE stable_id = ? AND annotated_at IS NULL
    `);

    const result = stmt.run(now, stableId);
    return result.changes > 0;
  }

  /**
   * Check if a function is pending annotation
   */
  isPending(stableId: string): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT 1 FROM touched_functions
      WHERE stable_id = ? AND annotated_at IS NULL
      LIMIT 1
    `);

    return stmt.get(stableId) !== undefined;
  }

  /**
   * Get touch history for a specific function
   */
  getHistory(stableId: string, limit?: number): TouchedFunction[] {
    const db = getDatabase();
    const sql = `
      SELECT id, stable_id as stableId, file_path as filePath, touched_at as touchedAt,
             change_id as changeId, annotated_at as annotatedAt
      FROM touched_functions
      WHERE stable_id = ?
      ORDER BY touched_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const stmt = db.prepare(sql);
    return (limit ? stmt.all(stableId, limit) : stmt.all(stableId)) as TouchedFunction[];
  }

  /**
   * Get statistics
   */
  getStats(): TouchedStats {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE annotated_at IS NULL) as pending,
        COUNT(*) FILTER (WHERE annotated_at IS NOT NULL) as annotated,
        COUNT(*) as total
      FROM touched_functions
    `).get() as TouchedStats;

    return stats;
  }

  /**
   * Clear all annotated records (cleanup old data)
   */
  clearAnnotated(): number {
    const db = getDatabase();

    const stmt = db.prepare(`
      DELETE FROM touched_functions
      WHERE annotated_at IS NOT NULL
    `);

    const result = stmt.run();
    return result.changes;
  }

  /**
   * Clear records older than specified milliseconds
   */
  clearOlderThan(maxAgeMs: number): number {
    const db = getDatabase();
    const cutoff = Date.now() - maxAgeMs;

    const stmt = db.prepare(`
      DELETE FROM touched_functions
      WHERE touched_at < ? AND annotated_at IS NOT NULL
    `);

    const result = stmt.run(cutoff);
    return result.changes;
  }
}

// ============================================
// Singleton
// ============================================

let instance: TouchedFunctionsStore | null = null;

export function getTouchedStore(): TouchedFunctionsStore {
  if (!instance) {
    instance = new TouchedFunctionsStore();
  }
  return instance;
}
