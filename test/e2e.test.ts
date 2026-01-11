/**
 * E2E Integration Tests
 *
 * Tests the full pipeline against a known fixture project:
 * 1. Parser extracts expected nodes
 * 2. Call graph has correct edges
 * 3. Call tree builds correct structure
 * 4. Entry point detection works
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AnalysisPipeline } from '../src/analyzer/pipeline.js';
import { CodeGraph } from '../src/graph/graph.js';
import * as path from 'path';
import * as fs from 'fs';

// Load expected results
const fixtureDir = path.join(__dirname, 'fixtures/e2e-project');
const expectedPath = path.join(fixtureDir, 'expected.json');
const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));

// Single file fixture (cross-file resolution not yet implemented)
const testFile = path.join(fixtureDir, 'app.ts');

describe('E2E: Full Pipeline Integration', () => {
  let pipeline: AnalysisPipeline;
  let graph: CodeGraph;

  beforeAll(async () => {
    pipeline = new AnalysisPipeline();
    // Only analyze single file - cross-file call resolution not implemented
    await pipeline.analyzeFile(testFile);
    graph = pipeline.getGraph();
  });

  describe('Node Extraction', () => {
    it('extracts all expected functions', () => {
      const nodes = graph.getAllNodes();
      const functionNames = nodes
        .filter(n => n.kind === 'function' || n.kind === 'method')
        .map(n => n.name);

      for (const expectedFn of expected.expectedNodes.functions) {
        expect(functionNames, `Missing function: ${expectedFn}`).toContain(expectedFn);
      }
    });

    it('extracts all expected classes', () => {
      const nodes = graph.getAllNodes();
      const classNames = nodes
        .filter(n => n.kind === 'class')
        .map(n => n.name);

      for (const expectedClass of expected.expectedNodes.classes) {
        expect(classNames, `Missing class: ${expectedClass}`).toContain(expectedClass);
      }
    });

    it('correctly identifies exported functions', () => {
      const nodes = graph.getAllNodes();
      const exportedNames = nodes
        .filter(n => n.exported)
        .map(n => n.name);

      for (const expectedExport of expected.expectedNodes.exported) {
        expect(exportedNames, `Missing export: ${expectedExport}`).toContain(expectedExport);
      }
    });

    it('extracts source previews for functions', () => {
      const nodes = graph.getAllNodes();
      const handleRequest = nodes.find(n => n.name === 'handleRequest');

      expect(handleRequest).toBeDefined();
      expect(handleRequest?.sourcePreview).toBeDefined();
      expect(handleRequest?.sourcePreview).toContain('req.json');
    });

    it('extracts JSDoc descriptions', () => {
      const nodes = graph.getAllNodes();
      const handleRequest = nodes.find(n => n.name === 'handleRequest');

      expect(handleRequest).toBeDefined();
      expect(handleRequest?.description).toBeDefined();
      expect(handleRequest?.description).toContain('entry point');
    });
  });

  describe('Call Graph Edges', () => {
    it('creates all expected call edges', () => {
      const edges = graph.getAllEdges();
      const nodes = graph.getAllNodes();

      // Helper to find node by name
      const findNode = (name: string) => nodes.find(n => n.name === name);

      for (const expectedEdge of expected.expectedEdges.calls) {
        const fromNode = findNode(expectedEdge.from);
        const toNode = findNode(expectedEdge.to);

        expect(fromNode, `Source node not found: ${expectedEdge.from}`).toBeDefined();
        expect(toNode, `Target node not found: ${expectedEdge.to}`).toBeDefined();

        if (fromNode && toNode) {
          const hasEdge = edges.some(
            e => e.source === fromNode.id && e.target === toNode.id && e.type === 'calls'
          );
          expect(hasEdge, `Missing edge: ${expectedEdge.from} -> ${expectedEdge.to}`).toBe(true);
        }
      }
    });

    it('findCallers returns correct callers', () => {
      const nodes = graph.getAllNodes();
      const processData = nodes.find(n => n.name === 'processData');

      expect(processData).toBeDefined();
      if (processData) {
        const callers = graph.findCallers(processData.id);
        const callerNames = callers.map(n => n.name);

        expect(callerNames).toContain('handleRequest');
      }
    });

    it('findCallees returns correct callees', () => {
      const nodes = graph.getAllNodes();
      const handleRequest = nodes.find(n => n.name === 'handleRequest');

      expect(handleRequest).toBeDefined();
      if (handleRequest) {
        const callees = graph.findCallees(handleRequest.id);
        const calleeNames = callees.map(n => n.name);

        expect(calleeNames).toContain('validateInput');
        expect(calleeNames).toContain('processData');
        expect(calleeNames).toContain('formatResponse');
      }
    });
  });

  describe('Call Tree', () => {
    it('builds correct call tree from entry point', () => {
      const nodes = graph.getAllNodes();
      const handleRequest = nodes.find(n => n.name === 'handleRequest');

      expect(handleRequest).toBeDefined();
      if (handleRequest) {
        const tree = graph.getCallTree(handleRequest.id, 3);

        expect(tree).toBeDefined();
        expect(tree?.node.name).toBe('handleRequest');
        expect(tree?.depth).toBe(0);

        // Collect all nodes in tree
        const treeNodeNames: string[] = [];
        const collectNames = (node: typeof tree) => {
          if (!node) return;
          treeNodeNames.push(node.node.name);
          node.children.forEach(collectNames);
        };
        collectNames(tree);

        // Check expected nodes are in tree
        for (const expectedName of expected.expectedCallTree.depth3) {
          expect(treeNodeNames, `Missing in call tree: ${expectedName}`).toContain(expectedName);
        }
      }
    });

    it('respects maxDepth parameter', () => {
      const nodes = graph.getAllNodes();
      const handleRequest = nodes.find(n => n.name === 'handleRequest');

      expect(handleRequest).toBeDefined();
      if (handleRequest) {
        const shallowTree = graph.getCallTree(handleRequest.id, 1);
        const deepTree = graph.getCallTree(handleRequest.id, 5);

        // Count nodes in each tree
        const countNodes = (node: typeof shallowTree): number => {
          if (!node) return 0;
          return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
        };

        const shallowCount = countNodes(shallowTree);
        const deepCount = countNodes(deepTree);

        // Deep tree should have more nodes
        expect(deepCount).toBeGreaterThan(shallowCount);
      }
    });
  });

  describe('Entry Points', () => {
    it('identifies exported functions with no callers as entry points', () => {
      const nodes = graph.getAllNodes();
      const edges = graph.getAllEdges();

      // Find nodes that are exported and have no incoming call edges
      const calledNodeIds = new Set(
        edges.filter(e => e.type === 'calls').map(e => e.target)
      );

      const entryPoints = nodes.filter(n =>
        n.exported &&
        (n.kind === 'function' || n.kind === 'method') &&
        !calledNodeIds.has(n.id)
      );

      const entryPointNames = entryPoints.map(n => n.name);

      for (const expectedEntry of expected.entryPoints) {
        expect(entryPointNames, `Missing entry point: ${expectedEntry}`).toContain(expectedEntry);
      }
    });
  });

  describe('Search', () => {
    it('finds nodes by exact name', () => {
      const results = graph.searchNodes('handleRequest');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('handleRequest');
    });

    it('finds nodes by partial name', () => {
      const results = graph.searchNodes('Data');
      const names = results.map(n => n.name);

      expect(names).toContain('processData');
      expect(names).toContain('transformData');
    });

    it('prioritizes exact matches over partial', () => {
      const results = graph.searchNodes('saveToDb');
      expect(results[0].name).toBe('saveToDb');
    });
  });

  describe('Neighborhood', () => {
    it('returns connected nodes within hops', () => {
      const nodes = graph.getAllNodes();
      const processData = nodes.find(n => n.name === 'processData');

      expect(processData).toBeDefined();
      if (processData) {
        const neighborhood = graph.getNeighborhood(processData.id, 1);
        const neighborNames = neighborhood.nodes.map(n => n.name);

        // Should include processData itself
        expect(neighborNames).toContain('processData');
        // Should include direct callers
        expect(neighborNames).toContain('handleRequest');
        // Should include direct callees
        expect(neighborNames).toContain('transformData');
        expect(neighborNames).toContain('saveToDb');
      }
    });
  });

  describe('Stats', () => {
    it('reports correct statistics', () => {
      const stats = graph.getStats();

      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.edgeCount).toBeGreaterThan(0);
      expect(stats.fileCount).toBe(1); // Single file fixture (app.ts)
      expect(stats.functionCount).toBe(expected.expectedNodes.functions.length);
      expect(stats.classCount).toBe(expected.expectedNodes.classes.length);
    });
  });
});
