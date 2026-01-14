/**
 * Drift Detector
 * Detects semantic drift when code changes but annotations become stale
 */

import { getDriftStore, type DriftEvent, type DriftEventInput } from '../storage/drift-store.js';
import { getAnnotationStore } from '../storage/annotation-store.js';
import type { DriftType, DriftSeverity, GraphNode } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface DriftAnalysis {
  nodeId: string;
  oldHash: string;
  newHash: string;
  driftType: DriftType;
  severity: DriftSeverity;
  reason: string;
  linesChanged?: number;
  signatureChanged?: boolean;
}

export interface DriftDetectionResult {
  detected: boolean;
  driftId?: number;
  analysis?: DriftAnalysis;
  skipped?: string;
}

export interface NodeChange {
  nodeId: string;
  stableId: string;
  oldHash?: string;
  newHash: string;
  oldSignature?: string;
  newSignature?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

// ============================================
// Severity Thresholds
// ============================================

const SEVERITY_THRESHOLDS = {
  /** Less than 20% lines changed = low severity */
  lowMaxPercent: 20,
  /** 20-50% lines changed = medium severity */
  mediumMaxPercent: 50,
  /** More than 50% = high severity */
};

// ============================================
// Drift Detector
// ============================================

export class DriftDetector {
  /**
   * Detect drift for a single node change
   * Uses stableId for annotation lookup to survive signature changes
   */
  detectDrift(change: NodeChange): DriftDetectionResult {
    const annotationStore = getAnnotationStore();
    const driftStore = getDriftStore();

    // Get current annotation for this node (by stableId)
    const annotation = annotationStore.getCurrent(change.stableId);

    // No annotation = no drift detection needed
    if (!annotation) {
      return {
        detected: false,
        skipped: 'No annotation exists for this node',
      };
    }

    // Same hash = no change
    if (annotation.contentHash === change.newHash) {
      return {
        detected: false,
        skipped: 'Content hash unchanged',
      };
    }

    // Content changed while annotation exists = drift
    const analysis = this.analyzeChange(change, annotation.contentHash);

    // Record drift event with both IDs
    const driftInput: DriftEventInput = {
      nodeId: change.nodeId,
      stableId: change.stableId,
      oldContentHash: annotation.contentHash,
      newContentHash: change.newHash,
      oldAnnotationId: annotation.id,
      driftType: analysis.driftType,
      severity: analysis.severity,
    };

    const driftId = driftStore.recordDrift(driftInput);

    return {
      detected: true,
      driftId,
      analysis,
    };
  }

  /**
   * Analyze a change to determine drift type and severity
   */
  analyzeChange(change: NodeChange, oldAnnotationHash: string): DriftAnalysis {
    const linesChanged = (change.linesAdded ?? 0) + (change.linesRemoved ?? 0);
    const signatureChanged = change.oldSignature !== change.newSignature;

    // Determine drift type
    let driftType: DriftType = 'unknown';

    if (signatureChanged) {
      // Signature change = semantic drift (API changed)
      driftType = 'semantic';
    } else if (linesChanged > 0 && linesChanged < 10) {
      // Small changes likely just implementation tweaks
      driftType = 'implementation';
    } else if (linesChanged >= 10) {
      // Large changes could be semantic
      driftType = 'semantic';
    }

    // Determine severity
    let severity: DriftSeverity = 'low';
    const reasons: string[] = [];

    if (signatureChanged) {
      severity = 'medium';
      reasons.push('function signature changed');
    }

    if (linesChanged > 0) {
      reasons.push(`${linesChanged} lines changed`);

      // Determine severity based on change magnitude
      if (linesChanged > 50) {
        severity = 'high';
      } else if (linesChanged > 20) {
        // Upgrade to medium if not already higher
        if (severity === 'low') {
          severity = 'medium';
        }
      }
    }

    // Signature change + significant line changes = high severity
    if (signatureChanged && linesChanged > 10) {
      severity = 'high';
    }

    return {
      nodeId: change.nodeId,
      oldHash: oldAnnotationHash,
      newHash: change.newHash,
      driftType,
      severity,
      reason: reasons.length > 0 ? reasons.join(', ') : 'content hash changed',
      linesChanged,
      signatureChanged,
    };
  }

  /**
   * Batch detect drift for multiple nodes
   */
  detectDriftBatch(changes: NodeChange[]): DriftDetectionResult[] {
    return changes.map(change => this.detectDrift(change));
  }

  /**
   * Check all annotated nodes for drift based on current graph state
   * Uses stableId for annotation matching
   */
  checkAllForDrift(nodes: GraphNode[]): DriftDetectionResult[] {
    const annotationStore = getAnnotationStore();
    const results: DriftDetectionResult[] = [];

    for (const node of nodes) {
      if (!node.contentHash) continue;
      if (node.kind !== 'function' && node.kind !== 'method') continue;

      const annotation = annotationStore.getCurrent(node.stableId);
      if (!annotation) continue;

      if (annotation.contentHash !== node.contentHash) {
        const result = this.detectDrift({
          nodeId: node.id,
          stableId: node.stableId,
          oldHash: annotation.contentHash,
          newHash: node.contentHash,
          oldSignature: undefined, // Would need to store this
          newSignature: node.signature,
        });
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get unresolved drift for display
   */
  getUnresolvedDrift(limit?: number): DriftEvent[] {
    const driftStore = getDriftStore();
    return driftStore.getUnresolved(limit);
  }

  /**
   * Get drift statistics
   */
  getStats(): {
    unresolved: number;
    bySeverity: Record<DriftSeverity, number>;
    byType: Record<DriftType, number>;
  } {
    const driftStore = getDriftStore();
    const stats = driftStore.getStats();

    return {
      unresolved: stats.unresolved,
      bySeverity: stats.bySeverity,
      byType: stats.byType,
    };
  }

  /**
   * Resolve drift when annotation is regenerated (by stableId)
   */
  resolveOnAnnotation(stableId: string): number {
    const driftStore = getDriftStore();
    return driftStore.resolveNodeDrift(stableId, 'Annotation regenerated');
  }

  /**
   * Manually resolve drift
   */
  resolveDrift(driftId: number, resolution: string): boolean {
    const driftStore = getDriftStore();
    return driftStore.resolveDrift(driftId, resolution);
  }

  /**
   * Check if a node has unresolved drift (by stableId)
   */
  hasUnresolvedDrift(stableId: string): boolean {
    const driftStore = getDriftStore();
    return driftStore.hasUnresolvedDrift(stableId);
  }

  /**
   * Get drift history for a node (by stableId)
   */
  getNodeDriftHistory(stableId: string): DriftEvent[] {
    const driftStore = getDriftStore();
    return driftStore.getNodeDrift(stableId);
  }

  /**
   * Get current unresolved drift for a node (by stableId)
   */
  getNodeDrift(stableId: string): DriftEvent | null {
    const driftStore = getDriftStore();
    return driftStore.getUnresolvedNodeDrift(stableId);
  }
}

// ============================================
// Singleton
// ============================================

let instance: DriftDetector | null = null;

export function getDriftDetector(): DriftDetector {
  if (!instance) {
    instance = new DriftDetector();
  }
  return instance;
}
