/**
 * Tests for Rule Store and Rule Evaluator
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { RuleStore } from '../src/storage/rule-store.js';
import { RuleEvaluator } from '../src/analyzer/rule-evaluator.js';
import { initDatabase, closeDatabase, getDatabase } from '../src/storage/sqlite.js';
import { CodeGraph } from '../src/graph/graph.js';
import { AnalysisPipeline } from '../src/analyzer/pipeline.js';
import type { ObservabilityRule } from '../src/types/index.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('Rules', () => {
  let dbPath: string;
  let ruleStore: RuleStore;
  let testIdCounter = 0;

  // Generate unique IDs for each test to avoid conflicts
  const uniqueId = () => `test-rule-${++testIdCounter}-${Date.now()}`;

  beforeEach(() => {
    // Create temp database
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeflow-rules-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    initDatabase(dbPath);
    ruleStore = new RuleStore();
  });

  afterEach(() => {
    closeDatabase();
    // Cleanup temp files
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      fs.rmdirSync(path.dirname(dbPath));
    }
  });

  describe('RuleStore', () => {
    it('saves and retrieves a rule', () => {
      const id = uniqueId();
      const testRule: ObservabilityRule = {
        id,
        name: 'Test Missing Annotations',
        condition: 'missing_annotation',
        threshold: 10,
        action: 'warn',
        enabled: true,
      };

      ruleStore.saveRule(testRule);
      const retrieved = ruleStore.getRule(id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(id);
      expect(retrieved?.name).toBe('Test Missing Annotations');
      expect(retrieved?.condition).toBe('missing_annotation');
      expect(retrieved?.threshold).toBe(10);
      expect(retrieved?.action).toBe('warn');
      expect(retrieved?.enabled).toBe(true);
    });

    it('returns null for non-existent rule', () => {
      const retrieved = ruleStore.getRule('non-existent');
      expect(retrieved).toBeNull();
    });

    it('gets all rules', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();

      ruleStore.saveRule({
        id: id1,
        name: 'Rule 1',
        condition: 'missing_annotation',
        action: 'warn',
        enabled: true,
      });
      ruleStore.saveRule({
        id: id2,
        name: 'Rule 2',
        condition: 'stale',
        action: 'warn',
        enabled: true,
      });

      const rules = ruleStore.getAllRules();
      const ourRules = rules.filter(r => r.id === id1 || r.id === id2);
      expect(ourRules).toHaveLength(2);
    });

    it('gets only enabled rules', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();

      ruleStore.saveRule({
        id: id1,
        name: 'Enabled Rule',
        condition: 'missing_annotation',
        action: 'warn',
        enabled: true,
      });
      ruleStore.saveRule({
        id: id2,
        name: 'Disabled Rule',
        condition: 'stale',
        action: 'warn',
        enabled: false,
      });

      const enabled = ruleStore.getEnabledRules();
      const ourEnabled = enabled.filter(r => r.id === id1 || r.id === id2);
      expect(ourEnabled).toHaveLength(1);
      expect(ourEnabled[0].name).toBe('Enabled Rule');
    });

    it('updates a rule', () => {
      const id = uniqueId();
      ruleStore.saveRule({
        id,
        name: 'Test Rule',
        condition: 'missing_annotation',
        threshold: 10,
        action: 'warn',
        enabled: true,
      });

      const success = ruleStore.updateRule(id, { threshold: 20, enabled: false });
      expect(success).toBe(true);

      const updated = ruleStore.getRule(id);
      expect(updated?.threshold).toBe(20);
      expect(updated?.enabled).toBe(false);
    });

    it('returns false when updating non-existent rule', () => {
      const success = ruleStore.updateRule('non-existent', { threshold: 20 });
      expect(success).toBe(false);
    });

    it('deletes a rule', () => {
      const id = uniqueId();
      ruleStore.saveRule({
        id,
        name: 'To Delete',
        condition: 'missing_annotation',
        action: 'warn',
        enabled: true,
      });

      const success = ruleStore.deleteRule(id);
      expect(success).toBe(true);
      expect(ruleStore.getRule(id)).toBeNull();
    });

    it('records and retrieves evaluations', () => {
      const id = uniqueId();
      ruleStore.saveRule({
        id,
        name: 'Test Rule',
        condition: 'missing_annotation',
        action: 'warn',
        enabled: true,
      });

      ruleStore.recordEvaluation(id, true, { count: 5 }, 'logged');
      ruleStore.recordEvaluation(id, false);

      const history = ruleStore.getEvaluationHistory(id);
      expect(history).toHaveLength(2);
      expect(history[0].violated).toBe(false); // Most recent first
      expect(history[1].violated).toBe(true);
    });

    it('gets recent violations', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();

      ruleStore.saveRule({ id: id1, name: 'Rule 1', condition: 'missing_annotation', action: 'warn', enabled: true });
      ruleStore.saveRule({ id: id2, name: 'Rule 2', condition: 'stale', action: 'warn', enabled: true });

      ruleStore.recordEvaluation(id1, true);
      ruleStore.recordEvaluation(id2, true);
      ruleStore.recordEvaluation(id1, false);

      const violations = ruleStore.getRecentViolations();
      const ourViolations = violations.filter(v => v.ruleId === id1 || v.ruleId === id2);
      expect(ourViolations).toHaveLength(2);
      expect(ourViolations.every(v => v.violated)).toBe(true);
    });

    it('gets stats', () => {
      // Get baseline stats before adding new rules
      const baselineStats = ruleStore.getStats();

      const id1 = uniqueId();
      const id2 = uniqueId();

      ruleStore.saveRule({ id: id1, name: 'Enabled', condition: 'missing_annotation', action: 'warn', enabled: true });
      ruleStore.saveRule({ id: id2, name: 'Disabled', condition: 'stale', action: 'warn', enabled: false });
      ruleStore.recordEvaluation(id1, true);

      const stats = ruleStore.getStats();
      // Check incremental change from baseline
      expect(stats.totalRules).toBe(baselineStats.totalRules + 2);
      expect(stats.enabledRules).toBe(baselineStats.enabledRules + 1);
      expect(stats.totalEvaluations).toBe(baselineStats.totalEvaluations + 1);
    });
  });

  describe('RuleEvaluator', () => {
    let graph: CodeGraph;
    let evaluator: RuleEvaluator;
    let pipeline: AnalysisPipeline;

    beforeEach(async () => {
      // Create a graph with some test nodes
      pipeline = new AnalysisPipeline();
      graph = pipeline.getGraph();
      evaluator = new RuleEvaluator();
      evaluator.setGraph(graph);

      // Analyze a single file to populate the graph
      const testFile = path.join(__dirname, 'fixtures', 'e2e-project', 'app.ts');
      await pipeline.analyzeFile(testFile);
    });

    it('evaluates missing_annotation rule', () => {
      const rule: ObservabilityRule = {
        id: uniqueId(),
        name: 'Test Missing',
        condition: 'missing_annotation',
        threshold: 0, // All functions need annotations
        action: 'warn',
        enabled: true,
      };

      const result = evaluator.evaluateRule(rule);

      // Should find violations since no annotations exist
      expect(result.violated).toBe(true);
      expect(result.targets.length).toBeGreaterThan(0);
      expect(result.targets[0].type).toBe('function');
      expect(result.targets[0].reason).toBe('No annotation exists');
    });

    it('evaluates with threshold', () => {
      const rule: ObservabilityRule = {
        id: uniqueId(),
        name: 'Test Missing with Threshold',
        condition: 'missing_annotation',
        threshold: 100, // Allow 100% unannotated
        action: 'warn',
        enabled: true,
      };

      const result = evaluator.evaluateRule(rule);

      // Should not violate with 100% threshold
      expect(result.violated).toBe(false);
    });

    it('evaluates high_drift rule with no drift', () => {
      const rule: ObservabilityRule = {
        id: uniqueId(),
        name: 'Test Drift',
        condition: 'high_drift',
        threshold: 0,
        action: 'warn',
        enabled: true,
      };

      const result = evaluator.evaluateRule(rule);

      // No drift events should exist in fresh DB
      expect(result.violated).toBe(false);
      expect(result.targets).toHaveLength(0);
    });

    it('evaluates concept_shifted rule with no shifts', () => {
      const rule: ObservabilityRule = {
        id: uniqueId(),
        name: 'Test Concept Shift',
        condition: 'concept_shifted',
        threshold: 0,
        action: 'warn',
        enabled: true,
      };

      const result = evaluator.evaluateRule(rule);

      // No concept shifts should exist in fresh DB
      expect(result.violated).toBe(false);
      expect(result.targets).toHaveLength(0);
    });

    it('evaluates uncovered_module rule', () => {
      const rule: ObservabilityRule = {
        id: uniqueId(),
        name: 'Test Uncovered Modules',
        condition: 'uncovered_module',
        threshold: 0,
        action: 'warn',
        enabled: true,
      };

      const result = evaluator.evaluateRule(rule);

      // Should find uncovered modules
      expect(result.violated).toBe(true);
      expect(result.targets.every(t => t.type === 'module')).toBe(true);
    });

    it('evaluateAll evaluates all enabled rules', () => {
      const id1 = uniqueId();
      const id2 = uniqueId();

      ruleStore.saveRule({
        id: id1,
        name: 'Rule 1',
        condition: 'missing_annotation',
        threshold: 0,
        action: 'warn',
        enabled: true,
      });

      ruleStore.saveRule({
        id: id2,
        name: 'Rule 2',
        condition: 'uncovered_module',
        threshold: 0,
        action: 'warn',
        enabled: true,
      });

      const violations = evaluator.evaluateAll();

      // Filter to our rules
      const ourViolations = violations.filter(v => v.ruleId === id1 || v.ruleId === id2);
      expect(ourViolations).toHaveLength(2);
      expect(ourViolations.map(v => v.ruleId).sort()).toEqual([id1, id2].sort());
    });
  });
});
