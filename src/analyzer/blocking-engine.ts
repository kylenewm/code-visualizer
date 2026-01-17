/**
 * Blocking Engine
 * Enforces block actions from rule violations
 */

import type { RuleViolation } from './rule-evaluator.js';
import { getRuleStore } from '../storage/rule-store.js';

export interface BlockingResult {
  blocked: boolean;
  violations: RuleViolation[];
  message?: string;
}

export class BlockingEngine {
  /**
   * Check if any violations should block the operation
   */
  shouldBlock(violations: RuleViolation[]): boolean {
    return violations.some(v => v.action === 'block' && v.targets.length > 0);
  }

  /**
   * Get only the violations that have block action
   */
  getBlockingViolations(violations: RuleViolation[]): RuleViolation[] {
    return violations.filter(v => v.action === 'block' && v.targets.length > 0);
  }

  /**
   * Evaluate violations and return blocking result
   */
  evaluate(violations: RuleViolation[]): BlockingResult {
    const blockingViolations = this.getBlockingViolations(violations);

    if (blockingViolations.length === 0) {
      return { blocked: false, violations: [] };
    }

    // Record blocking events
    this.recordBlocked(blockingViolations);

    // Build message
    const totalTargets = blockingViolations.reduce((sum, v) => sum + v.targets.length, 0);
    const ruleNames = blockingViolations.map(v => v.ruleName).join(', ');

    return {
      blocked: true,
      violations: blockingViolations,
      message: `Blocked by ${blockingViolations.length} rule(s): ${ruleNames} (${totalTargets} target(s))`,
    };
  }

  /**
   * Record blocking events in the database
   */
  private recordBlocked(violations: RuleViolation[]): void {
    const ruleStore = getRuleStore();

    for (const violation of violations) {
      ruleStore.recordEvaluation(
        violation.ruleId,
        true,
        {
          blocked: true,
          targetCount: violation.targets.length,
          targets: violation.targets.slice(0, 5).map(t => ({ name: t.name, reason: t.reason })),
        },
        'blocked'
      );
    }
  }
}

// Singleton instance
let instance: BlockingEngine | null = null;

export function getBlockingEngine(): BlockingEngine {
  if (!instance) {
    instance = new BlockingEngine();
  }
  return instance;
}
