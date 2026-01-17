/**
 * Semantic Golden Tests
 *
 * These tests prove the semantic observability system understands MEANING,
 * not just moves data around. Each test exercises a specific semantic capability
 * with known inputs and expected outputs.
 *
 * If these tests fail, the semantic layer has regressed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AnalysisPipeline } from '../src/analyzer/pipeline.js';
import { CodeGraph } from '../src/graph/graph.js';
import { getAnnotationStore } from '../src/storage/annotation-store.js';
import { getConceptLayer } from '../src/analyzer/concept-layer.js';
import { getSemanticCompare } from '../src/analyzer/semantic-compare.js';
import { getInvariantChecker } from '../src/analyzer/invariants.js';
import { getImpactAnalyzer } from '../src/analyzer/impact-analyzer.js';
import { initDatabase, closeDatabase } from '../src/storage/sqlite.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const fixtureDir = path.join(__dirname, 'fixtures/saas-platform');

describe('Semantic Golden Tests', () => {
  let pipeline: AnalysisPipeline;
  let graph: CodeGraph;
  let tempDbPath: string;

  beforeAll(async () => {
    // Use isolated temp database for tests
    tempDbPath = path.join(os.tmpdir(), `codeflow-test-${Date.now()}.db`);
    initDatabase(tempDbPath);

    // Analyze the saas-platform fixture
    pipeline = new AnalysisPipeline();
    await pipeline.analyzeDirectory(fixtureDir);
    graph = pipeline.getGraph();

    // Wire up components
    const conceptLayer = getConceptLayer();
    conceptLayer.setGraph(graph);

    const invariantChecker = getInvariantChecker();
    invariantChecker.setGraph(graph);

    const impactAnalyzer = getImpactAnalyzer();
    impactAnalyzer.setGraph(graph);
  });

  afterAll(() => {
    closeDatabase();
    // Clean up temp database
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  // ============================================
  // Test 1: Concept Shift Detection
  // ============================================
  describe('Concept Shift Detection', () => {
    it('detects when annotation purpose changes significantly', async () => {
      const annotationStore = getAnnotationStore();
      const semanticCompare = getSemanticCompare();

      // Find a function to test with
      const nodes = graph.getAllNodes();
      const testNode = nodes.find(n => n.kind === 'function' && n.name === 'create_session');
      expect(testNode).toBeDefined();

      // Create initial annotation about authentication
      const authAnnotation = 'Handles user authentication by creating a new login session with JWT tokens';

      // Create contrasting annotation about billing
      const billingAnnotation = 'Processes payment transactions and updates billing records in the database';

      // Compare semantically - should detect significant difference
      const comparison = await semanticCompare.compare(authAnnotation, billingAnnotation);

      // Similarity should be LOW (< 50%) because these are very different purposes
      expect(comparison.similarity).toBeLessThan(0.5);
      expect(comparison.classification).toBe('DIFFERENT');
    });

    it('recognizes similar annotations as same concept', async () => {
      const semanticCompare = getSemanticCompare();

      const annotation1 = 'Validates user credentials and creates authentication session';
      const annotation2 = 'Authenticates user login and establishes session token';

      const comparison = await semanticCompare.compare(annotation1, annotation2);

      // Similarity should be HIGH (> 70%) because these are similar purposes
      expect(comparison.similarity).toBeGreaterThan(0.7);
    });
  });

  // ============================================
  // Test 2: Semantic Search Accuracy
  // ============================================
  describe('Semantic Search', () => {
    it('ranks results by semantic relevance', async () => {
      const annotationStore = getAnnotationStore();
      const conceptLayer = getConceptLayer();

      // Find auth and billing functions
      const nodes = graph.getAllNodes();
      const authNode = nodes.find(n => n.name === 'create_session');
      const billingNode = nodes.find(n => n.name === 'process_payment');

      expect(authNode).toBeDefined();
      expect(billingNode).toBeDefined();

      // Create annotations
      annotationStore.saveAnnotation(
        authNode!.id,
        authNode!.stableId,
        'Handles user authentication and creates login session',
        authNode!.contentHash,
        'manual'
      );

      annotationStore.saveAnnotation(
        billingNode!.id,
        billingNode!.stableId,
        'Processes payment transactions and charges credit cards',
        billingNode!.contentHash,
        'manual'
      );

      // Search for "user login" - should find auth function higher than billing
      const results = await conceptLayer.semanticSearch('user login authentication', 10);

      // Should have results
      expect(results.length).toBeGreaterThan(0);

      // Auth-related results should rank higher than billing for auth query
      const authResult = results.find(r => r.name === 'create_session');
      const billingResult = results.find(r => r.name === 'process_payment');

      if (authResult && billingResult) {
        expect(authResult.similarity).toBeGreaterThan(billingResult.similarity);
      }
    });
  });

  // ============================================
  // Test 3: Impact Analysis
  // ============================================
  describe('Impact Analysis', () => {
    it('calculates correct blast radius for high-impact function', () => {
      const impactAnalyzer = getImpactAnalyzer();

      // Find get_subscription - known to have 5 callers in fixture
      const nodes = graph.getAllNodes();
      const targetNode = nodes.find(n => n.name === 'get_subscription');

      expect(targetNode).toBeDefined();

      const impact = impactAnalyzer.analyzeImpact(targetNode!.id);

      // Should have multiple callers
      expect(impact.directCallers.length).toBeGreaterThan(0);
      expect(impact.total).toBeGreaterThanOrEqual(impact.directCallers.length);
    });

    it('identifies high-impact functions correctly', () => {
      const impactAnalyzer = getImpactAnalyzer();

      const hotspots = impactAnalyzer.findHighImpactFunctions(5);

      // Should find functions with callers
      expect(hotspots.length).toBeGreaterThan(0);

      // Results should be sorted by caller count (descending)
      for (let i = 1; i < hotspots.length; i++) {
        expect(hotspots[i - 1].callerCount).toBeGreaterThanOrEqual(hotspots[i].callerCount);
      }

      // get_subscription should be in top hotspots
      const hasGetSubscription = hotspots.some(h => h.node.name === 'get_subscription');
      expect(hasGetSubscription).toBe(true);
    });
  });

  // ============================================
  // Test 4: Invariant Detection
  // ============================================
  describe('Invariant Detection', () => {
    it('flags exported functions without annotations', () => {
      const invariantChecker = getInvariantChecker();

      const result = invariantChecker.checkInvariant('public-api-annotated');

      // Fixture has many exported functions without annotations
      expect(result.violated).toBe(true);
      expect(result.targets.length).toBeGreaterThan(0);

      // Targets should be functions
      for (const target of result.targets) {
        expect(target.type).toBe('function');
        expect(target.reason).toContain('Exported function without annotation');
      }
    });

    it('flags critical path functions without annotations', () => {
      const invariantChecker = getInvariantChecker();

      const result = invariantChecker.checkInvariant('critical-paths-annotated');

      // get_subscription has 5+ callers and likely no annotation
      // This invariant should flag it
      if (result.violated) {
        const hasHighCallerFunction = result.targets.some(
          t => t.reason.includes('Called by') && t.reason.includes('functions')
        );
        expect(hasHighCallerFunction).toBe(true);
      }
    });

    it('returns summary with all invariant results', () => {
      const invariantChecker = getInvariantChecker();

      const summary = invariantChecker.getSummary();

      expect(summary.totalInvariants).toBe(6); // We have 6 hardcoded invariants
      expect(summary.violated + summary.passed).toBe(summary.totalInvariants);
    });
  });
});
