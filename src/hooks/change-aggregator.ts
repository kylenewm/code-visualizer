/**
 * Change Aggregator
 * Collects file changes from Claude hooks and file watcher,
 * deduplicates, triggers analysis, and captures git diffs
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { dirname } from 'path';
import type { FileChangeEvent } from './adapter.js';
import { AnalysisPipeline } from '../analyzer/pipeline.js';
import type { CodeGraph } from '../graph/graph.js';

// ============================================
// Types
// ============================================

export interface ChangeAggregatorConfig {
  /** Time window to aggregate changes before triggering analysis (ms) */
  aggregationWindowMs: number;
  /** Prefer hook events over filesystem events */
  preferHookEvents: boolean;
  /** Maximum files to analyze in one batch */
  maxBatchSize: number;
  /** Whether to capture git diffs */
  captureGitDiffs: boolean;
  /** Maximum number of change events to keep */
  maxChangeHistory: number;
}

/** Rich change event with diff information */
export interface ChangeEvent {
  id: string;
  filePath: string;
  fileName: string;
  timestamp: number;
  type: 'create' | 'modify' | 'delete';
  source: 'claude_hook' | 'fs_watcher' | 'mixed';
  /** Git diff output (if available) */
  diff?: string;
  /** Summary of changes: "Added 2 functions, modified 1" */
  summary?: string;
  /** List of affected function names */
  affectedFunctions: string[];
  /** Lines added */
  linesAdded: number;
  /** Lines removed */
  linesRemoved: number;
}

export interface AggregatedChange {
  filePath: string;
  lastType: 'create' | 'modify' | 'delete';
  source: 'claude_hook' | 'fs_watcher' | 'mixed';
  firstSeen: number;
  lastSeen: number;
  eventCount: number;
}

export interface AnalysisResult {
  changedFiles: string[];
  analyzedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  durationMs: number;
}

// ============================================
// Change Aggregator
// ============================================

export class ChangeAggregator extends EventEmitter {
  private config: ChangeAggregatorConfig;
  private pendingChanges: Map<string, AggregatedChange> = new Map();
  private changeHistory: ChangeEvent[] = [];
  private aggregationTimer: NodeJS.Timeout | null = null;
  private analysisInProgress = false;
  private graph: CodeGraph | null = null;
  private pipeline: AnalysisPipeline;
  private changeIdCounter = 0;

  constructor(config: Partial<ChangeAggregatorConfig> = {}) {
    super();
    this.config = {
      aggregationWindowMs: 1000,  // 1 second default
      preferHookEvents: true,     // Hook events are more reliable
      maxBatchSize: 50,
      captureGitDiffs: true,
      maxChangeHistory: 100,
      ...config,
    };
    this.pipeline = new AnalysisPipeline();
  }

  /**
   * Get git diff for a file
   */
  private getGitDiff(filePath: string): { diff: string; linesAdded: number; linesRemoved: number } | null {
    if (!this.config.captureGitDiffs) {
      return null;
    }

    try {
      const cwd = dirname(filePath);
      // Get diff for the file (staged + unstaged)
      const diff = execSync(`git diff HEAD -- "${filePath}" 2>/dev/null || git diff -- "${filePath}" 2>/dev/null`, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024, // 1MB max
        timeout: 5000,
      }).trim();

      if (!diff) {
        return null;
      }

      // Count lines added/removed
      let linesAdded = 0;
      let linesRemoved = 0;
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          linesAdded++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          linesRemoved++;
        }
      }

      return { diff, linesAdded, linesRemoved };
    } catch {
      // Not a git repo or git not available
      return null;
    }
  }

  /**
   * Generate a summary from the diff
   */
  private generateSummary(linesAdded: number, linesRemoved: number, type: 'create' | 'modify' | 'delete'): string {
    if (type === 'create') {
      return `Created with ${linesAdded} lines`;
    }
    if (type === 'delete') {
      return `Deleted (${linesRemoved} lines)`;
    }

    const parts: string[] = [];
    if (linesAdded > 0) {
      parts.push(`+${linesAdded}`);
    }
    if (linesRemoved > 0) {
      parts.push(`-${linesRemoved}`);
    }
    return parts.length > 0 ? parts.join(', ') + ' lines' : 'Modified';
  }

  /**
   * Extract affected function names from diff
   */
  private extractAffectedFunctions(diff: string): string[] {
    const functions: string[] = [];
    const patterns = [
      /^@@.*@@\s*(?:function\s+)?(\w+)\s*\(/gm,  // Function declarations
      /^@@.*@@\s*(?:async\s+)?(?:export\s+)?(?:default\s+)?function\s+(\w+)/gm,
      /^@@.*@@\s*(\w+)\s*=\s*(?:async\s+)?\(/gm,  // Arrow functions
      /^@@.*@@\s*(\w+)\s*\([^)]*\)\s*{/gm,  // Method shorthand
      /^\+.*?(?:function\s+)(\w+)\s*\(/gm,  // Added function
      /^\+.*?(?:async\s+)?(\w+)\s*=\s*(?:async\s+)?\(/gm,  // Added arrow
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(diff)) !== null) {
        if (match[1] && !functions.includes(match[1])) {
          functions.push(match[1]);
        }
      }
    }

    return functions;
  }

  /**
   * Record a change event with diff information
   */
  private recordChangeEvent(change: AggregatedChange): void {
    const gitInfo = this.getGitDiff(change.filePath);
    const fileName = change.filePath.split('/').pop() || change.filePath;

    const event: ChangeEvent = {
      id: `change-${++this.changeIdCounter}`,
      filePath: change.filePath,
      fileName,
      timestamp: change.lastSeen,
      type: change.lastType,
      source: change.source,
      diff: gitInfo?.diff,
      linesAdded: gitInfo?.linesAdded ?? 0,
      linesRemoved: gitInfo?.linesRemoved ?? 0,
      affectedFunctions: gitInfo?.diff ? this.extractAffectedFunctions(gitInfo.diff) : [],
      summary: this.generateSummary(
        gitInfo?.linesAdded ?? 0,
        gitInfo?.linesRemoved ?? 0,
        change.lastType
      ),
    };

    // Add to history (most recent first)
    this.changeHistory.unshift(event);

    // Trim history to max size
    if (this.changeHistory.length > this.config.maxChangeHistory) {
      this.changeHistory = this.changeHistory.slice(0, this.config.maxChangeHistory);
    }

    // Emit the rich change event
    this.emit('change:recorded', event);
  }

  /**
   * Get change history
   */
  getChangeHistory(limit?: number): ChangeEvent[] {
    if (limit) {
      return this.changeHistory.slice(0, limit);
    }
    return [...this.changeHistory];
  }

  /**
   * Get a specific change event by ID
   */
  getChangeEvent(id: string): ChangeEvent | undefined {
    return this.changeHistory.find(e => e.id === id);
  }

  /**
   * Set the graph instance to update with analysis results
   */
  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  /**
   * Add a file change event to the aggregation queue
   */
  addChange(event: FileChangeEvent): void {
    const existing = this.pendingChanges.get(event.filePath);

    if (existing) {
      // Update existing change
      existing.lastType = event.type;
      existing.lastSeen = event.timestamp;
      existing.eventCount++;

      // Track if we've seen events from multiple sources
      if (existing.source !== event.source) {
        existing.source = 'mixed';
      }
    } else {
      // New change
      this.pendingChanges.set(event.filePath, {
        filePath: event.filePath,
        lastType: event.type,
        source: event.source,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        eventCount: 1,
      });
    }

    this.emit('change', event);
    this.scheduleAnalysis();
  }

  /**
   * Schedule analysis after aggregation window
   */
  private scheduleAnalysis(): void {
    // Clear existing timer
    if (this.aggregationTimer) {
      clearTimeout(this.aggregationTimer);
    }

    // Schedule new analysis
    this.aggregationTimer = setTimeout(() => {
      this.runAnalysis();
    }, this.config.aggregationWindowMs);
  }

  /**
   * Run analysis on pending changes
   */
  private async runAnalysis(): Promise<void> {
    if (this.analysisInProgress) {
      // Re-schedule if analysis is in progress
      this.scheduleAnalysis();
      return;
    }

    if (this.pendingChanges.size === 0) {
      return;
    }

    this.analysisInProgress = true;
    const startTime = Date.now();

    // Collect files to analyze
    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    // Record change events with diffs (before analysis modifies files)
    for (const change of changes) {
      this.recordChangeEvent(change);
    }

    // Filter out deletes and limit batch size
    const filesToAnalyze = changes
      .filter((c) => c.lastType !== 'delete')
      .slice(0, this.config.maxBatchSize)
      .map((c) => c.filePath);

    const deletedFiles = changes
      .filter((c) => c.lastType === 'delete')
      .map((c) => c.filePath);

    const result: AnalysisResult = {
      changedFiles: changes.map((c) => c.filePath),
      analyzedFiles: [],
      errors: [],
      durationMs: 0,
    };

    this.emit('analysis:start', { files: filesToAnalyze, deletes: deletedFiles });

    // Analyze each file
    for (const filePath of filesToAnalyze) {
      try {
        // Clear old data for this file first
        if (this.graph) {
          this.graph.clearFile(filePath);
        }

        const analysisResult = await this.pipeline.analyzeFile(filePath);

        if (this.graph) {
          // Update graph with new nodes and edges
          for (const node of analysisResult.nodes) {
            this.graph.addNode(node);
          }
          for (const edge of analysisResult.edges) {
            this.graph.addEdge(edge);
          }
        }

        result.analyzedFiles.push(filePath);
      } catch (error) {
        result.errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Handle deleted files
    if (this.graph) {
      for (const filePath of deletedFiles) {
        this.graph.clearFile(filePath);
      }
    }

    result.durationMs = Date.now() - startTime;
    this.analysisInProgress = false;

    this.emit('analysis:complete', result);
  }

  /**
   * Force immediate analysis (skip aggregation window)
   */
  async flush(): Promise<AnalysisResult | null> {
    if (this.aggregationTimer) {
      clearTimeout(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    if (this.pendingChanges.size === 0) {
      return null;
    }

    // Wait for any in-progress analysis
    while (this.analysisInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return new Promise((resolve) => {
      this.once('analysis:complete', resolve);
      this.runAnalysis();
    });
  }

  /**
   * Get pending changes (not yet analyzed)
   */
  getPendingChanges(): AggregatedChange[] {
    return Array.from(this.pendingChanges.values());
  }

  /**
   * Check if analysis is in progress
   */
  isAnalyzing(): boolean {
    return this.analysisInProgress;
  }

  /**
   * Clear all pending changes without analyzing
   */
  clear(): void {
    if (this.aggregationTimer) {
      clearTimeout(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    this.pendingChanges.clear();
  }
}
