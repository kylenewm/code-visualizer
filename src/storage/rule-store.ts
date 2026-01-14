/**
 * Rule Store
 * Persistence layer for observability rules and evaluation history
 */

import { getDatabase } from './sqlite.js';
import type { ObservabilityRule, RuleCondition, RuleAction } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface RuleEvaluationRecord {
  id: number;
  ruleId: string;
  evaluatedAt: number;
  violated: boolean;
  context: string | null;
  actionTaken: string | null;
}

export interface RuleRecord {
  id: string;
  name: string;
  condition: RuleCondition;
  threshold: number | null;
  action: RuleAction;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Rule Store
// ============================================

export class RuleStore {
  /**
   * Save a new rule
   */
  saveRule(rule: ObservabilityRule): void {
    const db = getDatabase();
    const now = Date.now();

    db.prepare(`
      INSERT INTO observability_rules (id, name, condition, threshold, action, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id,
      rule.name,
      rule.condition,
      rule.threshold ?? null,
      rule.action,
      rule.enabled ? 1 : 0,
      now,
      now
    );
  }

  /**
   * Get a rule by ID
   */
  getRule(id: string): ObservabilityRule | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT id, name, condition, threshold, action, enabled
      FROM observability_rules
      WHERE id = ?
    `).get(id) as RuleRecord | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      condition: row.condition,
      threshold: row.threshold ?? undefined,
      action: row.action,
      enabled: Boolean(row.enabled),
    };
  }

  /**
   * Get all rules
   */
  getAllRules(): ObservabilityRule[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, name, condition, threshold, action, enabled
      FROM observability_rules
      ORDER BY created_at
    `).all() as RuleRecord[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      condition: row.condition,
      threshold: row.threshold ?? undefined,
      action: row.action,
      enabled: Boolean(row.enabled),
    }));
  }

  /**
   * Get all enabled rules
   */
  getEnabledRules(): ObservabilityRule[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, name, condition, threshold, action, enabled
      FROM observability_rules
      WHERE enabled = 1
      ORDER BY created_at
    `).all() as RuleRecord[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      condition: row.condition,
      threshold: row.threshold ?? undefined,
      action: row.action,
      enabled: true,
    }));
  }

  /**
   * Update a rule
   */
  updateRule(id: string, updates: Partial<Omit<ObservabilityRule, 'id'>>): boolean {
    const db = getDatabase();
    const existing = this.getRule(id);
    if (!existing) return false;

    const merged = { ...existing, ...updates };
    const now = Date.now();

    const result = db.prepare(`
      UPDATE observability_rules
      SET name = ?, condition = ?, threshold = ?, action = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.name,
      merged.condition,
      merged.threshold ?? null,
      merged.action,
      merged.enabled ? 1 : 0,
      now,
      id
    );

    return result.changes > 0;
  }

  /**
   * Delete a rule
   */
  deleteRule(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM observability_rules WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  /**
   * Record a rule evaluation
   */
  recordEvaluation(
    ruleId: string,
    violated: boolean,
    context?: Record<string, unknown>,
    actionTaken?: string
  ): number {
    const db = getDatabase();
    const now = Date.now();

    const result = db.prepare(`
      INSERT INTO rule_evaluations (rule_id, evaluated_at, violated, context, action_taken)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      ruleId,
      now,
      violated ? 1 : 0,
      context ? JSON.stringify(context) : null,
      actionTaken ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get evaluation history for a rule
   */
  getEvaluationHistory(ruleId: string, limit = 50): RuleEvaluationRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, rule_id as ruleId, evaluated_at as evaluatedAt, violated, context, action_taken as actionTaken
      FROM rule_evaluations
      WHERE rule_id = ?
      ORDER BY evaluated_at DESC
      LIMIT ?
    `).all(ruleId, limit) as Array<{
      id: number;
      ruleId: string;
      evaluatedAt: number;
      violated: number;
      context: string | null;
      actionTaken: string | null;
    }>;

    return rows.map(row => ({
      ...row,
      violated: Boolean(row.violated),
    }));
  }

  /**
   * Get recent violations across all rules
   */
  getRecentViolations(limit = 50): Array<RuleEvaluationRecord & { ruleName: string }> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT
        e.id,
        e.rule_id as ruleId,
        e.evaluated_at as evaluatedAt,
        e.violated,
        e.context,
        e.action_taken as actionTaken,
        r.name as ruleName
      FROM rule_evaluations e
      JOIN observability_rules r ON e.rule_id = r.id
      WHERE e.violated = 1
      ORDER BY e.evaluated_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: number;
      ruleId: string;
      evaluatedAt: number;
      violated: number;
      context: string | null;
      actionTaken: string | null;
      ruleName: string;
    }>;

    return rows.map(row => ({
      ...row,
      violated: true,
    }));
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    totalEvaluations: number;
    recentViolations: number;
  } {
    const db = getDatabase();

    const ruleStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
      FROM observability_rules
    `).get() as { total: number; enabled: number };

    const evalStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN violated = 1 AND evaluated_at > ? THEN 1 ELSE 0 END) as recentViolations
      FROM rule_evaluations
    `).get(Date.now() - 24 * 60 * 60 * 1000) as { total: number; recentViolations: number };

    return {
      totalRules: ruleStats.total,
      enabledRules: ruleStats.enabled,
      totalEvaluations: evalStats.total,
      recentViolations: evalStats.recentViolations,
    };
  }

  /**
   * Clear old evaluations (older than specified days)
   */
  cleanupOldEvaluations(daysOld = 30): number {
    const db = getDatabase();
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const result = db.prepare(`
      DELETE FROM rule_evaluations WHERE evaluated_at < ?
    `).run(cutoff);

    return result.changes;
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: RuleStore | null = null;

export function getRuleStore(): RuleStore {
  if (!instance) {
    instance = new RuleStore();
  }
  return instance;
}
