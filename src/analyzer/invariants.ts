/**
 * Invariants - Hardcoded observability contracts
 * These define semantic rules that should always hold true in a well-documented codebase
 */

import type { CodeGraph } from '../graph/graph.js';
import { getAnnotationStore } from '../storage/annotation-store.js';
import { getDriftStore } from '../storage/drift-store.js';
import { getModuleStore } from '../storage/module-store.js';
import { getConceptLayer } from './concept-layer.js';

// ============================================
// Types
// ============================================

export interface InvariantContext {
  graph: CodeGraph;
  annotationStore: ReturnType<typeof getAnnotationStore>;
  driftStore: ReturnType<typeof getDriftStore>;
  moduleStore: ReturnType<typeof getModuleStore>;
  conceptLayer: ReturnType<typeof getConceptLayer>;
}

export interface InvariantViolation {
  type: 'function' | 'module';
  id: string;
  name: string;
  filePath: string;
  reason: string;
}

export interface InvariantResult {
  violated: boolean;
  targets: InvariantViolation[];
}

export interface Invariant {
  id: string;
  name: string;
  description: string;
  check: (ctx: InvariantContext) => InvariantResult;
}

// ============================================
// Hardcoded Invariants
// ============================================

export const INVARIANTS: Invariant[] = [
  {
    id: 'public-api-annotated',
    name: 'Public API functions must be annotated',
    description: 'All exported functions should have semantic annotations explaining their purpose',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];
      const nodes = ctx.graph.getAllNodes();

      for (const node of nodes) {
        if ((node.kind === 'function' || node.kind === 'method') && node.exported) {
          const annotation = ctx.annotationStore.getCurrent(node.id);
          if (!annotation) {
            targets.push({
              type: 'function',
              id: node.id,
              name: node.name,
              filePath: node.filePath,
              reason: 'Exported function without annotation',
            });
          }
        }
      }

      return { violated: targets.length > 0, targets };
    },
  },
  {
    id: 'no-high-drift-unannotated',
    name: 'High drift functions must be re-annotated',
    description: 'Functions with high-severity drift should have their annotations updated',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];
      const highDrift = ctx.driftStore.getUnresolvedBySeverity('high');

      for (const drift of highDrift) {
        const parts = drift.nodeId.split(':');
        const filePath = parts[0] || 'unknown';
        const name = parts.length >= 3 ? parts[2] : drift.nodeId;

        targets.push({
          type: 'function',
          id: drift.nodeId,
          name,
          filePath,
          reason: `High drift unresolved since ${new Date(drift.detectedAt).toLocaleDateString()}`,
        });
      }

      return { violated: targets.length > 0, targets };
    },
  },
  {
    id: 'concept-shift-reviewed',
    name: 'Concept shifts must be reviewed',
    description: 'Functions whose purpose has changed should be reviewed and their annotations updated',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];

      // Check concept_shift_events table via concept layer
      const unreviewedShifts = ctx.conceptLayer.getUnreviewedShifts(50);

      for (const shift of unreviewedShifts) {
        const parts = shift.nodeId.split(':');
        const filePath = parts[0] || 'unknown';
        const name = parts.length >= 3 ? parts[2] : shift.nodeId;

        targets.push({
          type: 'function',
          id: shift.nodeId,
          name,
          filePath,
          reason: shift.shiftReason || `Purpose changed (${((shift.similarity || 0) * 100).toFixed(0)}% similarity)`,
        });
      }

      // Also check drift_events for concept shifts (legacy)
      const driftShifts = ctx.driftStore.getConceptShifts().filter(d => !d.resolvedAt);
      for (const drift of driftShifts) {
        // Skip if already included from concept layer
        if (targets.some(t => t.id === drift.nodeId)) continue;

        const parts = drift.nodeId.split(':');
        const filePath = parts[0] || 'unknown';
        const name = parts.length >= 3 ? parts[2] : drift.nodeId;

        targets.push({
          type: 'function',
          id: drift.nodeId,
          name,
          filePath,
          reason: drift.shiftReason || 'Purpose/intent of function changed - review needed',
        });
      }

      return { violated: targets.length > 0, targets };
    },
  },
  {
    id: 'critical-paths-annotated',
    name: 'Critical path functions must be annotated',
    description: 'Functions with many callers (high fan-in) should be annotated to document their contracts',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];
      const nodes = ctx.graph.getAllNodes();
      const CALLER_THRESHOLD = 5; // Functions called by 5+ other functions

      for (const node of nodes) {
        if (node.kind === 'function' || node.kind === 'method') {
          const callers = ctx.graph.findCallers(node.id);
          if (callers.length >= CALLER_THRESHOLD) {
            const annotation = ctx.annotationStore.getCurrent(node.id);
            if (!annotation) {
              targets.push({
                type: 'function',
                id: node.id,
                name: node.name,
                filePath: node.filePath,
                reason: `Called by ${callers.length} functions but has no annotation`,
              });
            }
          }
        }
      }

      return { violated: targets.length > 0, targets };
    },
  },
  {
    id: 'modules-have-summaries',
    name: 'Modules with 5+ functions need summaries',
    description: 'Modules/directories with significant code should have module-level summaries',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];
      const moduleGraph = ctx.graph.getModuleGraph();
      const FUNCTION_THRESHOLD = 5;

      for (const mod of moduleGraph.modules) {
        if (mod.functionCount >= FUNCTION_THRESHOLD) {
          const annotation = ctx.moduleStore.getAnnotation(mod.path);
          if (!annotation) {
            targets.push({
              type: 'module',
              id: mod.path,
              name: mod.name,
              filePath: mod.path,
              reason: `Module has ${mod.functionCount} functions but no summary`,
            });
          }
        }
      }

      return { violated: targets.length > 0, targets };
    },
  },
  {
    id: 'stale-annotations-limited',
    name: 'Stale annotations should be limited',
    description: 'No more than 20% of annotations should be stale (out of sync with code)',
    check: (ctx) => {
      const targets: InvariantViolation[] = [];
      const nodes = ctx.graph.getAllNodes();
      let totalAnnotated = 0;
      let staleCount = 0;

      for (const node of nodes) {
        if (node.kind === 'function' || node.kind === 'method') {
          const annotation = ctx.annotationStore.getCurrent(node.id);
          if (annotation) {
            totalAnnotated++;
            if (annotation.contentHash !== node.contentHash) {
              staleCount++;
              targets.push({
                type: 'function',
                id: node.id,
                name: node.name,
                filePath: node.filePath,
                reason: 'Annotation is stale - code has changed',
              });
            }
          }
        }
      }

      const stalePercent = totalAnnotated > 0 ? (staleCount / totalAnnotated) * 100 : 0;
      const violated = stalePercent > 20;

      // Only return targets if threshold exceeded
      return { violated, targets: violated ? targets : [] };
    },
  },
];

// ============================================
// Invariant Checker
// ============================================

export class InvariantChecker {
  private graph: CodeGraph | null = null;

  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  /**
   * Get all available invariants
   */
  getInvariants(): Invariant[] {
    return INVARIANTS;
  }

  /**
   * Get a specific invariant by ID
   */
  getInvariant(id: string): Invariant | undefined {
    return INVARIANTS.find(inv => inv.id === id);
  }

  /**
   * Check a specific invariant
   */
  checkInvariant(invariantId: string): InvariantResult {
    if (!this.graph) {
      return { violated: false, targets: [] };
    }

    const invariant = this.getInvariant(invariantId);
    if (!invariant) {
      return { violated: false, targets: [] };
    }

    const ctx: InvariantContext = {
      graph: this.graph,
      annotationStore: getAnnotationStore(),
      driftStore: getDriftStore(),
      moduleStore: getModuleStore(),
      conceptLayer: getConceptLayer(),
    };

    return invariant.check(ctx);
  }

  /**
   * Check all invariants
   */
  checkAll(): Map<string, InvariantResult> {
    const results = new Map<string, InvariantResult>();

    if (!this.graph) {
      return results;
    }

    const ctx: InvariantContext = {
      graph: this.graph,
      annotationStore: getAnnotationStore(),
      driftStore: getDriftStore(),
      moduleStore: getModuleStore(),
      conceptLayer: getConceptLayer(),
    };

    for (const invariant of INVARIANTS) {
      results.set(invariant.id, invariant.check(ctx));
    }

    return results;
  }

  /**
   * Get summary of all invariant violations
   */
  getSummary(): {
    totalInvariants: number;
    violated: number;
    passed: number;
    violations: Array<{ invariant: Invariant; targets: InvariantViolation[] }>;
  } {
    const results = this.checkAll();
    const violations: Array<{ invariant: Invariant; targets: InvariantViolation[] }> = [];

    for (const [id, result] of results) {
      if (result.violated) {
        const invariant = this.getInvariant(id);
        if (invariant) {
          violations.push({ invariant, targets: result.targets });
        }
      }
    }

    return {
      totalInvariants: INVARIANTS.length,
      violated: violations.length,
      passed: INVARIANTS.length - violations.length,
      violations,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: InvariantChecker | null = null;

export function getInvariantChecker(): InvariantChecker {
  if (!instance) {
    instance = new InvariantChecker();
  }
  return instance;
}
