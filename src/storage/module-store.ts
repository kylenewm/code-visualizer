/**
 * Module Store
 * Handles persistence for module-level annotations (aggregated from function annotations)
 */

import { getDatabase } from './sqlite.js';

// ============================================
// Types
// ============================================

export interface ModuleAnnotation {
  id: number;
  modulePath: string;
  summary: string;
  functionCount: number;
  contentHashes: string[];
  createdAt: number;
  supersededAt?: number;
}

export interface ModuleAnnotationInput {
  modulePath: string;
  summary: string;
  functionCount: number;
  contentHashes: string[];
}

export interface ModuleStalenessInfo {
  modulePath: string;
  annotation: ModuleAnnotation;
  currentFunctionCount: number;
  currentHashes: string[];
  missingHashes: string[];
  newHashes: string[];
  isStale: boolean;
}

// ============================================
// Module Store
// ============================================

export class ModuleStore {
  /**
   * Save a module annotation, superseding any existing one
   */
  saveAnnotation(input: ModuleAnnotationInput): { id: number; supersededId?: number } {
    const db = getDatabase();
    const now = Date.now();

    return db.transaction(() => {
      // Find current active annotation
      const currentStmt = db.prepare(`
        SELECT id FROM module_annotations
        WHERE module_path = ? AND superseded_at IS NULL
        LIMIT 1
      `);
      const current = currentStmt.get(input.modulePath) as { id: number } | undefined;

      // Supersede existing
      if (current) {
        const supersedingStmt = db.prepare(`
          UPDATE module_annotations
          SET superseded_at = ?
          WHERE id = ?
        `);
        supersedingStmt.run(now, current.id);
      }

      // Insert new annotation
      const insertStmt = db.prepare(`
        INSERT INTO module_annotations
        (module_path, summary, function_count, content_hashes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(
        input.modulePath,
        input.summary,
        input.functionCount,
        JSON.stringify(input.contentHashes),
        now
      );

      return {
        id: result.lastInsertRowid as number,
        supersededId: current?.id,
      };
    });
  }

  /**
   * Get the current annotation for a module
   */
  getAnnotation(modulePath: string): ModuleAnnotation | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        module_path as modulePath,
        summary,
        function_count as functionCount,
        content_hashes as contentHashes,
        created_at as createdAt,
        superseded_at as supersededAt
      FROM module_annotations
      WHERE module_path = ? AND superseded_at IS NULL
      LIMIT 1
    `);

    const result = stmt.get(modulePath) as (Omit<ModuleAnnotation, 'contentHashes'> & { contentHashes: string }) | undefined;
    if (!result) return null;

    return {
      ...result,
      contentHashes: JSON.parse(result.contentHashes),
    };
  }

  /**
   * Get annotation history for a module
   */
  getHistory(modulePath: string): ModuleAnnotation[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        module_path as modulePath,
        summary,
        function_count as functionCount,
        content_hashes as contentHashes,
        created_at as createdAt,
        superseded_at as supersededAt
      FROM module_annotations
      WHERE module_path = ?
      ORDER BY created_at DESC
    `);

    const results = stmt.all(modulePath) as Array<Omit<ModuleAnnotation, 'contentHashes'> & { contentHashes: string }>;
    return results.map(r => ({
      ...r,
      contentHashes: JSON.parse(r.contentHashes),
    }));
  }

  /**
   * Get all current module annotations
   */
  getAllCurrent(): Map<string, ModuleAnnotation> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        module_path as modulePath,
        summary,
        function_count as functionCount,
        content_hashes as contentHashes,
        created_at as createdAt,
        superseded_at as supersededAt
      FROM module_annotations
      WHERE superseded_at IS NULL
    `);

    const results = stmt.all() as Array<Omit<ModuleAnnotation, 'contentHashes'> & { contentHashes: string }>;
    const map = new Map<string, ModuleAnnotation>();

    for (const r of results) {
      map.set(r.modulePath, {
        ...r,
        contentHashes: JSON.parse(r.contentHashes),
      });
    }

    return map;
  }

  /**
   * Check staleness against current function hashes
   */
  checkStaleness(
    modulePath: string,
    currentHashes: string[],
    currentFunctionCount: number
  ): ModuleStalenessInfo | null {
    const annotation = this.getAnnotation(modulePath);
    if (!annotation) return null;

    const currentSet = new Set(currentHashes);
    const annotationSet = new Set(annotation.contentHashes);

    const missingHashes = annotation.contentHashes.filter(h => !currentSet.has(h));
    const newHashes = currentHashes.filter(h => !annotationSet.has(h));

    const isStale =
      missingHashes.length > 0 ||
      newHashes.length > 0 ||
      currentFunctionCount !== annotation.functionCount;

    return {
      modulePath,
      annotation,
      currentFunctionCount,
      currentHashes,
      missingHashes,
      newHashes,
      isStale,
    };
  }

  /**
   * Get modules needing annotation updates
   */
  getStaleModules(
    currentModuleHashes: Map<string, { hashes: string[]; functionCount: number }>
  ): ModuleStalenessInfo[] {
    const allAnnotations = this.getAllCurrent();
    const stale: ModuleStalenessInfo[] = [];

    for (const [modulePath, current] of currentModuleHashes) {
      const staleness = this.checkStaleness(modulePath, current.hashes, current.functionCount);
      if (staleness?.isStale) {
        stale.push(staleness);
      }
    }

    // Also find modules that have annotations but no longer exist
    for (const [modulePath, annotation] of allAnnotations) {
      if (!currentModuleHashes.has(modulePath)) {
        stale.push({
          modulePath,
          annotation,
          currentFunctionCount: 0,
          currentHashes: [],
          missingHashes: annotation.contentHashes,
          newHashes: [],
          isStale: true,
        });
      }
    }

    return stale;
  }

  /**
   * Delete module annotation
   */
  deleteAnnotation(modulePath: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM module_annotations WHERE module_path = ?');
    const result = stmt.run(modulePath);
    return result.changes > 0;
  }

  /**
   * Get module annotation statistics
   */
  getStats(): {
    totalModules: number;
    totalVersions: number;
    avgFunctionsPerModule: number;
  } {
    const db = getDatabase();

    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM module_annotations WHERE superseded_at IS NULL
    `);
    const totalModules = (totalStmt.get() as { count: number }).count;

    const versionsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM module_annotations
    `);
    const totalVersions = (versionsStmt.get() as { count: number }).count;

    const avgStmt = db.prepare(`
      SELECT AVG(function_count) as avg FROM module_annotations WHERE superseded_at IS NULL
    `);
    const avgFunctionsPerModule = (avgStmt.get() as { avg: number | null }).avg ?? 0;

    return {
      totalModules,
      totalVersions,
      avgFunctionsPerModule: Math.round(avgFunctionsPerModule * 10) / 10,
    };
  }
}

// ============================================
// Singleton
// ============================================

let instance: ModuleStore | null = null;

export function getModuleStore(): ModuleStore {
  if (!instance) {
    instance = new ModuleStore();
  }
  return instance;
}
