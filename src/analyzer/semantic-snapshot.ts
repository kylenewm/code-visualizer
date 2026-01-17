/**
 * Semantic Snapshot Generator
 * Aggregates data from concept layer, invariants, and impact analyzer
 * into a single unified view for human and Claude consumption
 */

import type { CodeGraph } from '../graph/graph.js';
import { getConceptLayer } from './concept-layer.js';
import { getInvariantChecker } from './invariants.js';
import { getImpactAnalyzer } from './impact-analyzer.js';
import { getAnnotationStore } from '../storage/annotation-store.js';

// ============================================
// Types
// ============================================

export interface SemanticSnapshot {
  generatedAt: number;
  project: string;

  domains: Array<{
    name: string;
    description?: string;
    memberCount: number;
    topMembers: string[];
  }>;

  unreviewedShifts: Array<{
    functionName: string;
    filePath: string;
    similarity: number;
    reason?: string;
  }>;

  violations: Array<{
    rule: string;
    ruleName: string;
    count: number;
    examples: string[];
  }>;

  hotspots: Array<{
    functionName: string;
    filePath: string;
    callerCount: number;
  }>;

  stats: {
    totalFunctions: number;
    annotatedCount: number;
    domainCount: number;
    violationCount: number;
    shiftCount: number;
  };
}

// ============================================
// Snapshot Generator
// ============================================

export class SemanticSnapshotGenerator {
  private graph: CodeGraph | null = null;

  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  generate(projectPath: string): SemanticSnapshot {
    if (!this.graph) {
      return this.emptySnapshot(projectPath);
    }

    const conceptLayer = getConceptLayer();
    const invariantChecker = getInvariantChecker();
    const impactAnalyzer = getImpactAnalyzer();
    const annotationStore = getAnnotationStore();

    // Get domains with member names
    const domainsRaw = conceptLayer.getDomainsWithTopMembers(3);
    const domains = domainsRaw.map(d => ({
      name: d.name,
      description: d.description,
      memberCount: d.memberCount,
      topMembers: d.topMembers,
    }));

    // Get shifts and enrich with function names
    const shiftsRaw = conceptLayer.getUnreviewedShifts(10);
    const unreviewedShifts = shiftsRaw.map(s => {
      const parts = s.nodeId.split(':');
      return {
        functionName: parts.length >= 3 ? parts[2] : s.nodeId,
        filePath: parts[0] || 'unknown',
        similarity: s.similarity ?? 0,
        reason: s.shiftReason,
      };
    });

    // Get invariant violations
    const summary = invariantChecker.getSummary();
    const violations = summary.violations.map(v => ({
      rule: v.invariant.id,
      ruleName: v.invariant.name,
      count: v.targets.length,
      examples: v.targets.slice(0, 3).map(t => t.name),
    }));

    // Get hotspots
    const hotspotsRaw = impactAnalyzer.findHighImpactFunctions(5);
    const hotspots = hotspotsRaw.map(h => ({
      functionName: h.node.name,
      filePath: h.node.filePath,
      callerCount: h.callerCount,
    }));

    // Stats
    const graphStats = this.graph.getStats();
    const annotationStats = annotationStore.getStats();

    return {
      generatedAt: Date.now(),
      project: projectPath,
      domains,
      unreviewedShifts,
      violations,
      hotspots,
      stats: {
        totalFunctions: graphStats.functionCount,
        annotatedCount: annotationStats.nodesWithAnnotations,
        domainCount: domains.length,
        violationCount: summary.violated,
        shiftCount: unreviewedShifts.length,
      },
    };
  }

  private emptySnapshot(projectPath: string): SemanticSnapshot {
    return {
      generatedAt: Date.now(),
      project: projectPath,
      domains: [],
      unreviewedShifts: [],
      violations: [],
      hotspots: [],
      stats: {
        totalFunctions: 0,
        annotatedCount: 0,
        domainCount: 0,
        violationCount: 0,
        shiftCount: 0,
      },
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: SemanticSnapshotGenerator | null = null;

export function getSnapshotGenerator(): SemanticSnapshotGenerator {
  if (!instance) {
    instance = new SemanticSnapshotGenerator();
  }
  return instance;
}
