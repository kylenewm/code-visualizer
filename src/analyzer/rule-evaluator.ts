/**
 * Rule Evaluator
 * Evaluates observability rules against current system state
 */

import { getRuleStore } from '../storage/rule-store.js';
import { getAnnotationStore } from '../storage/annotation-store.js';
import { getModuleStore } from '../storage/module-store.js';
import { getDriftStore } from '../storage/drift-store.js';
import type { CodeGraph } from '../graph/graph.js';
import type { ObservabilityRule, RuleCondition } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  condition: RuleCondition;
  action: 'warn' | 'block' | 'auto_regenerate';
  targets: ViolationTarget[];
  evaluatedAt: number;
}

export interface ViolationTarget {
  type: 'function' | 'module';
  id: string;
  name: string;
  filePath: string;
  reason: string;
}

export interface EvaluationResult {
  rule: ObservabilityRule;
  violated: boolean;
  targets: ViolationTarget[];
  evaluatedAt: number;
}

// ============================================
// Rule Evaluator
// ============================================

export class RuleEvaluator {
  private graph: CodeGraph | null = null;

  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  /**
   * Evaluate all enabled rules
   */
  evaluateAll(): RuleViolation[] {
    const ruleStore = getRuleStore();
    const rules = ruleStore.getEnabledRules();
    const violations: RuleViolation[] = [];

    for (const rule of rules) {
      const result = this.evaluateRule(rule);
      if (result.violated) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          condition: rule.condition,
          action: rule.action,
          targets: result.targets,
          evaluatedAt: result.evaluatedAt,
        });

        // Record evaluation
        ruleStore.recordEvaluation(
          rule.id,
          true,
          { targetCount: result.targets.length, targets: result.targets.slice(0, 5) },
          rule.action === 'warn' ? 'logged' : undefined
        );
      } else {
        // Record non-violation for history
        ruleStore.recordEvaluation(rule.id, false);
      }
    }

    return violations;
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule: ObservabilityRule): EvaluationResult {
    const evaluatedAt = Date.now();

    switch (rule.condition) {
      case 'missing_annotation':
        return this.checkMissingAnnotations(rule, evaluatedAt);
      case 'stale':
        return this.checkStaleAnnotations(rule, evaluatedAt);
      case 'high_drift':
        return this.checkHighDrift(rule, evaluatedAt);
      case 'uncovered_module':
        return this.checkUncoveredModules(rule, evaluatedAt);
      case 'concept_shifted':
        return this.checkConceptShifted(rule, evaluatedAt);
      default:
        return { rule, violated: false, targets: [], evaluatedAt };
    }
  }

  /**
   * Check for functions without annotations
   */
  private checkMissingAnnotations(rule: ObservabilityRule, evaluatedAt: number): EvaluationResult {
    if (!this.graph) {
      return { rule, violated: false, targets: [], evaluatedAt };
    }

    const annotationStore = getAnnotationStore();
    const nodes = this.graph.getAllNodes();
    const targets: ViolationTarget[] = [];
    const threshold = rule.threshold ?? 0; // Default: all functions need annotations

    let totalFunctions = 0;
    let annotatedFunctions = 0;

    for (const node of nodes) {
      if (node.kind === 'function' || node.kind === 'method') {
        totalFunctions++;
        const annotation = annotationStore.getCurrent(node.id);
        if (annotation) {
          annotatedFunctions++;
        } else {
          targets.push({
            type: 'function',
            id: node.id,
            name: node.name,
            filePath: node.filePath,
            reason: 'No annotation exists',
          });
        }
      }
    }

    // Check against threshold (percentage of unannotated allowed)
    const unannotatedPercent = totalFunctions > 0
      ? ((totalFunctions - annotatedFunctions) / totalFunctions) * 100
      : 0;
    const violated = unannotatedPercent > threshold;

    return { rule, violated, targets: violated ? targets : [], evaluatedAt };
  }

  /**
   * Check for stale annotations (content hash mismatch)
   */
  private checkStaleAnnotations(rule: ObservabilityRule, evaluatedAt: number): EvaluationResult {
    if (!this.graph) {
      return { rule, violated: false, targets: [], evaluatedAt };
    }

    const annotationStore = getAnnotationStore();
    const nodes = this.graph.getAllNodes();
    const targets: ViolationTarget[] = [];

    for (const node of nodes) {
      if (node.kind === 'function' || node.kind === 'method') {
        const annotation = annotationStore.getCurrent(node.id);
        if (annotation && annotation.contentHash !== node.contentHash) {
          targets.push({
            type: 'function',
            id: node.id,
            name: node.name,
            filePath: node.filePath,
            reason: `Content hash mismatch: annotation=${annotation.contentHash.slice(0, 8)}, current=${node.contentHash?.slice(0, 8) ?? 'none'}`,
          });
        }
      }
    }

    const threshold = rule.threshold ?? 0; // Default: no stale allowed
    const violated = targets.length > threshold;

    return { rule, violated, targets: violated ? targets : [], evaluatedAt };
  }

  /**
   * Check for high-severity unresolved drift
   */
  private checkHighDrift(rule: ObservabilityRule, evaluatedAt: number): EvaluationResult {
    const driftStore = getDriftStore();
    const highDrift = driftStore.getUnresolvedBySeverity('high');
    const targets: ViolationTarget[] = [];

    for (const drift of highDrift) {
      // Parse nodeId to get file path (format: filePath:kind:name:hash)
      const parts = drift.nodeId.split(':');
      const filePath = parts[0] || 'unknown';
      const name = parts.length >= 3 ? parts[2] : drift.nodeId;

      targets.push({
        type: 'function',
        id: drift.nodeId,
        name,
        filePath,
        reason: `High-severity drift detected at ${new Date(drift.detectedAt).toISOString()}`,
      });
    }

    const threshold = rule.threshold ?? 0; // Default: no high drift allowed
    const violated = targets.length > threshold;

    return { rule, violated, targets: violated ? targets : [], evaluatedAt };
  }

  /**
   * Check for modules without summaries
   */
  private checkUncoveredModules(rule: ObservabilityRule, evaluatedAt: number): EvaluationResult {
    if (!this.graph) {
      return { rule, violated: false, targets: [], evaluatedAt };
    }

    const moduleStore = getModuleStore();
    const moduleGraph = this.graph.getModuleGraph();
    const targets: ViolationTarget[] = [];

    for (const mod of moduleGraph.modules) {
      const annotation = moduleStore.getAnnotation(mod.path);
      if (!annotation && mod.functionCount > 0) {
        targets.push({
          type: 'module',
          id: mod.path,
          name: mod.name,
          filePath: mod.path,
          reason: `Module has ${mod.functionCount} functions but no summary`,
        });
      }
    }

    const threshold = rule.threshold ?? 0; // Default: all modules need summaries
    const violated = targets.length > threshold;

    return { rule, violated, targets: violated ? targets : [], evaluatedAt };
  }

  /**
   * Check for unreviewed concept shifts (purpose changes)
   */
  private checkConceptShifted(rule: ObservabilityRule, evaluatedAt: number): EvaluationResult {
    const driftStore = getDriftStore();
    const conceptShifts = driftStore.getConceptShifts();
    const targets: ViolationTarget[] = [];

    for (const drift of conceptShifts) {
      // Only include unresolved concept shifts
      if (!drift.resolvedAt) {
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
    }

    const threshold = rule.threshold ?? 0; // Default: no unreviewed concept shifts allowed
    const violated = targets.length > threshold;

    return { rule, violated, targets: violated ? targets : [], evaluatedAt };
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: RuleEvaluator | null = null;

export function getRuleEvaluator(): RuleEvaluator {
  if (!instance) {
    instance = new RuleEvaluator();
  }
  return instance;
}
