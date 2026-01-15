/**
 * Impact Analyzer
 * Traces downstream dependencies to understand the blast radius of changes
 */

import type { CodeGraph } from '../graph/graph.js';
import type { GraphNode } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface ImpactResult {
  /** Node that was analyzed */
  nodeId: string;
  nodeName: string;
  /** Direct callers (depth 1) */
  directCallers: GraphNode[];
  /** All affected functions (transitive) */
  allAffected: GraphNode[];
  /** Count by depth level */
  byDepth: Map<number, GraphNode[]>;
  /** Total affected count */
  total: number;
  /** How many affected functions are public API (exported) */
  exportedCount: number;
  /** Critical paths - exported functions that depend on this */
  criticalPaths: GraphNode[];
}

export interface ImpactSummary {
  /** Human-readable summary */
  summary: string;
  /** Severity based on impact */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Quick stats */
  stats: {
    directCallers: number;
    totalAffected: number;
    publicAPIAffected: number;
  };
}

// ============================================
// Impact Analyzer
// ============================================

export class ImpactAnalyzer {
  private graph: CodeGraph | null = null;

  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  /**
   * Analyze the impact of changes to a specific node
   */
  analyzeImpact(nodeId: string, maxDepth: number = 3): ImpactResult | null {
    if (!this.graph) {
      return null;
    }

    const node = this.graph.getNode(nodeId);
    if (!node) {
      return null;
    }

    const transitiveCallers = this.graph.getTransitiveCallers(nodeId, maxDepth);
    const directCallers = transitiveCallers.byDepth.get(1) ?? [];
    const criticalPaths = transitiveCallers.callers.filter(c => c.exported);

    return {
      nodeId,
      nodeName: node.name,
      directCallers,
      allAffected: transitiveCallers.callers,
      byDepth: transitiveCallers.byDepth,
      total: transitiveCallers.total,
      exportedCount: transitiveCallers.exportedCount,
      criticalPaths,
    };
  }

  /**
   * Get a human-readable summary of the impact
   */
  summarizeImpact(nodeId: string): ImpactSummary | null {
    const impact = this.analyzeImpact(nodeId);
    if (!impact) {
      return null;
    }

    const severity = this.calculateSeverity(impact);
    const summary = this.generateSummary(impact, severity);

    return {
      summary,
      severity,
      stats: {
        directCallers: impact.directCallers.length,
        totalAffected: impact.total,
        publicAPIAffected: impact.exportedCount,
      },
    };
  }

  /**
   * Calculate severity based on impact metrics
   */
  private calculateSeverity(impact: ImpactResult): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: affects public API
    if (impact.exportedCount > 0) {
      if (impact.exportedCount >= 3) return 'critical';
      return 'high';
    }

    // High: affects many functions
    if (impact.total >= 10) return 'high';

    // Medium: affects some functions
    if (impact.total >= 3) return 'medium';

    // Low: minimal impact
    return 'low';
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(impact: ImpactResult, severity: string): string {
    if (impact.total === 0) {
      return `Changes to "${impact.nodeName}" are isolated - no callers found.`;
    }

    const parts: string[] = [];

    parts.push(`Changes to "${impact.nodeName}" affect ${impact.total} function(s)`);

    if (impact.exportedCount > 0) {
      parts.push(`including ${impact.exportedCount} public API function(s)`);
    }

    if (impact.directCallers.length !== impact.total) {
      parts.push(`(${impact.directCallers.length} direct, ${impact.total - impact.directCallers.length} indirect)`);
    }

    return parts.join(' ');
  }

  /**
   * Get impact for multiple nodes (batch analysis)
   */
  analyzeMultiple(nodeIds: string[]): Map<string, ImpactResult> {
    const results = new Map<string, ImpactResult>();

    for (const nodeId of nodeIds) {
      const impact = this.analyzeImpact(nodeId);
      if (impact) {
        results.set(nodeId, impact);
      }
    }

    return results;
  }

  /**
   * Find functions with highest impact (most callers)
   */
  findHighImpactFunctions(limit: number = 10): Array<{ node: GraphNode; callerCount: number }> {
    if (!this.graph) {
      return [];
    }

    const nodes = this.graph.getAllNodes();
    const results: Array<{ node: GraphNode; callerCount: number }> = [];

    for (const node of nodes) {
      if (node.kind === 'function' || node.kind === 'method') {
        const callers = this.graph.findCallers(node.id);
        results.push({ node, callerCount: callers.length });
      }
    }

    // Sort by caller count descending
    results.sort((a, b) => b.callerCount - a.callerCount);

    return results.slice(0, limit);
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: ImpactAnalyzer | null = null;

export function getImpactAnalyzer(): ImpactAnalyzer {
  if (!instance) {
    instance = new ImpactAnalyzer();
  }
  return instance;
}
