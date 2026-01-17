/**
 * Module Summarizer
 * Aggregates function-level annotations into module-level summaries
 */

import { getModuleStore, type ModuleAnnotation } from '../storage/module-store.js';
import { getAnnotationStore, type AnnotationVersion } from '../storage/annotation-store.js';
import type { CodeGraph } from '../graph/graph.js';
import type { GraphNode, ExtendedModuleNode } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface ModuleSummaryInput {
  modulePath: string;
  functionAnnotations: Array<{
    nodeId: string;
    name: string;
    text: string;
    contentHash: string;
  }>;
}

export interface ModuleSummaryResult {
  modulePath: string;
  summary: string;
  functionCount: number;
  functionsCovered: number;
  contentHashes: string[];
  isNew: boolean;
  supersededId?: number;
}

export interface ModuleCoverage {
  modulePath: string;
  totalFunctions: number;
  annotatedFunctions: number;
  coveragePercent: number;
  unannotated: string[];
}

// ============================================
// Prompt Templates
// ============================================

const SUMMARY_PROMPT = `You are summarizing the purpose of a code module based on its function annotations.

Module: {{modulePath}}

Function annotations:
{{functionAnnotations}}

Write a 2-4 sentence summary of this module's purpose and responsibilities. Focus on:
1. What this module does (its main responsibility)
2. How it fits into the larger system
3. Key capabilities it provides

Be concise and technical. Do not use marketing language.`;

// ============================================
// Module Summarizer
// ============================================

export class ModuleSummarizer {
  private graph: CodeGraph | null = null;

  /**
   * Set the graph instance for lookups
   */
  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  /**
   * Generate a module summary from function annotations (without AI - uses template)
   * For production, this would call Claude API
   */
  generateSummary(input: ModuleSummaryInput): string {
    const { modulePath, functionAnnotations } = input;

    if (functionAnnotations.length === 0) {
      return `Module at ${modulePath} - no annotated functions.`;
    }

    // Group annotations by apparent purpose
    const capabilities = new Map<string, string[]>();

    for (const fn of functionAnnotations) {
      // Extract key verbs/actions from annotation
      const text = fn.text.toLowerCase();
      let category = 'general';

      if (text.includes('create') || text.includes('generate') || text.includes('build')) {
        category = 'creation';
      } else if (text.includes('parse') || text.includes('extract') || text.includes('analyze')) {
        category = 'analysis';
      } else if (text.includes('save') || text.includes('store') || text.includes('persist')) {
        category = 'storage';
      } else if (text.includes('get') || text.includes('fetch') || text.includes('load')) {
        category = 'retrieval';
      } else if (text.includes('transform') || text.includes('convert') || text.includes('process')) {
        category = 'transformation';
      } else if (text.includes('validate') || text.includes('check') || text.includes('verify')) {
        category = 'validation';
      }

      if (!capabilities.has(category)) {
        capabilities.set(category, []);
      }
      capabilities.get(category)!.push(fn.name);
    }

    // Build summary
    const moduleName = modulePath.split('/').pop() || modulePath;
    const parts: string[] = [];

    parts.push(`The ${moduleName} module`);

    const capList: string[] = [];
    for (const [category, funcs] of capabilities) {
      if (category === 'general') continue;
      capList.push(`${category} (${funcs.slice(0, 3).join(', ')}${funcs.length > 3 ? '...' : ''})`);
    }

    if (capList.length > 0) {
      parts.push(`provides ${capList.join(', ')}`);
    }

    parts.push(`functionality with ${functionAnnotations.length} annotated functions.`);

    // Add specific examples
    if (functionAnnotations.length > 0) {
      const examples = functionAnnotations.slice(0, 2).map(fn => fn.text.split('.')[0]).join('. ');
      if (examples) {
        parts.push(examples + '.');
      }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Summarize a module and save to store
   */
  summarizeModule(modulePath: string): ModuleSummaryResult | null {
    if (!this.graph) {
      throw new Error('Graph not set. Call setGraph() first.');
    }

    // Get all functions in this module
    const moduleFunctions = this.getModuleFunctions(modulePath);
    if (moduleFunctions.length === 0) {
      return null;
    }

    // Get annotations for each function
    const annotationStore = getAnnotationStore();
    const functionAnnotations: ModuleSummaryInput['functionAnnotations'] = [];
    const contentHashes: string[] = [];

    for (const fn of moduleFunctions) {
      const annotation = annotationStore.getCurrent(fn.id);
      if (annotation) {
        functionAnnotations.push({
          nodeId: fn.id,
          name: fn.name,
          text: annotation.text,
          contentHash: annotation.contentHash,
        });
        contentHashes.push(annotation.contentHash);
      }
    }

    // Generate summary
    const summary = this.generateSummary({
      modulePath,
      functionAnnotations,
    });

    // Save to store
    const moduleStore = getModuleStore();
    const result = moduleStore.saveAnnotation({
      modulePath,
      summary,
      functionCount: moduleFunctions.length,
      contentHashes,
    });

    return {
      modulePath,
      summary,
      functionCount: moduleFunctions.length,
      functionsCovered: functionAnnotations.length,
      contentHashes,
      isNew: !result.supersededId,
      supersededId: result.supersededId,
    };
  }

  /**
   * Get all functions in a module directory
   */
  private getModuleFunctions(modulePath: string): GraphNode[] {
    if (!this.graph) return [];

    const allNodes = this.graph.getAllNodes();
    return allNodes.filter(node => {
      if (node.kind !== 'function' && node.kind !== 'method') return false;
      const nodeDir = node.filePath.substring(0, node.filePath.lastIndexOf('/'));
      return nodeDir === modulePath || node.filePath.startsWith(modulePath + '/');
    });
  }

  /**
   * Get coverage statistics for a module
   */
  getModuleCoverage(modulePath: string): ModuleCoverage {
    const functions = this.getModuleFunctions(modulePath);
    const annotationStore = getAnnotationStore();

    const annotated: string[] = [];
    const unannotated: string[] = [];

    for (const fn of functions) {
      if (annotationStore.hasAnnotation(fn.id)) {
        annotated.push(fn.name);
      } else {
        unannotated.push(fn.name);
      }
    }

    return {
      modulePath,
      totalFunctions: functions.length,
      annotatedFunctions: annotated.length,
      coveragePercent: functions.length > 0 ? Math.round((annotated.length / functions.length) * 100) : 0,
      unannotated,
    };
  }

  /**
   * Get extended module node with annotation data
   */
  getExtendedModuleNode(modulePath: string): ExtendedModuleNode | null {
    if (!this.graph) return null;

    const moduleGraph = this.graph.getModuleGraph();
    const baseModule = moduleGraph.modules.find(m => m.path === modulePath);
    if (!baseModule) return null;

    const moduleStore = getModuleStore();
    const annotation = moduleStore.getAnnotation(modulePath);

    if (!annotation) {
      return { ...baseModule };
    }

    // Check staleness
    const functions = this.getModuleFunctions(modulePath);
    const currentHashes = functions
      .map(fn => fn.contentHash)
      .filter((h): h is string => h !== undefined);
    const staleness = moduleStore.checkStaleness(modulePath, currentHashes, functions.length);

    return {
      ...baseModule,
      annotation: {
        summary: annotation.summary,
        functionsCovered: annotation.contentHashes.length,
        functionsTotal: functions.length,
        generatedAt: annotation.createdAt,
        stale: staleness?.isStale ?? false,
      },
    };
  }

  /**
   * Get all modules with their annotation status
   */
  getAllExtendedModules(): ExtendedModuleNode[] {
    if (!this.graph) return [];

    const moduleGraph = this.graph.getModuleGraph();
    return moduleGraph.modules.map(m => this.getExtendedModuleNode(m.path) ?? m);
  }

  /**
   * Get modules that need annotation updates
   */
  getStaleModules(): Array<{ modulePath: string; reason: string }> {
    if (!this.graph) return [];

    const moduleStore = getModuleStore();
    const moduleGraph = this.graph.getModuleGraph();
    const stale: Array<{ modulePath: string; reason: string }> = [];

    for (const module of moduleGraph.modules) {
      const functions = this.getModuleFunctions(module.path);
      const currentHashes = functions
        .map(fn => fn.contentHash)
        .filter((h): h is string => h !== undefined);

      const staleness = moduleStore.checkStaleness(module.path, currentHashes, functions.length);

      if (!staleness) {
        stale.push({ modulePath: module.path, reason: 'No annotation' });
      } else if (staleness.isStale) {
        const reasons: string[] = [];
        if (staleness.newHashes.length > 0) {
          reasons.push(`${staleness.newHashes.length} new functions`);
        }
        if (staleness.missingHashes.length > 0) {
          reasons.push(`${staleness.missingHashes.length} changed functions`);
        }
        if (staleness.currentFunctionCount !== staleness.annotation.functionCount) {
          reasons.push('function count changed');
        }
        stale.push({ modulePath: module.path, reason: reasons.join(', ') });
      }
    }

    return stale;
  }

  /**
   * Regenerate all stale module summaries
   */
  regenerateStale(): ModuleSummaryResult[] {
    const stale = this.getStaleModules();
    const results: ModuleSummaryResult[] = [];

    for (const { modulePath } of stale) {
      const result = this.summarizeModule(modulePath);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }
}

// ============================================
// Singleton
// ============================================

let instance: ModuleSummarizer | null = null;

export function getModuleSummarizer(): ModuleSummarizer {
  if (!instance) {
    instance = new ModuleSummarizer();
  }
  return instance;
}
