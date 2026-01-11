/**
 * Change Detector
 * Main entry point for change detection.
 * Combines Claude hooks (when available) with file watcher fallback.
 */

import { EventEmitter } from 'events';
import { ClaudeHookAdapter, type FileChangeEvent } from './adapter.js';
import { FileWatcher, type FileWatcherConfig } from './file-watcher.js';
import { ChangeAggregator, type AnalysisResult, type ChangeAggregatorConfig, type ChangeEvent } from './change-aggregator.js';
import type { CodeGraph } from '../graph/graph.js';

// ============================================
// Types
// ============================================

export interface ChangeDetectorConfig {
  /** Root directory to watch */
  rootDir: string;
  /** Use file watcher (default: true) */
  useFileWatcher: boolean;
  /** File watcher settings */
  watcher: Partial<FileWatcherConfig>;
  /** Change aggregator settings */
  aggregator: Partial<ChangeAggregatorConfig>;
  /** Retain file content in events */
  retainContent: boolean;
}

export interface ChangeDetectorStats {
  eventsReceived: number;
  eventsFromHooks: number;
  eventsFromWatcher: number;
  analysisRuns: number;
  totalFilesAnalyzed: number;
  lastAnalysisMs: number | null;
}

// ============================================
// Change Detector
// ============================================

export class ChangeDetector extends EventEmitter {
  private config: ChangeDetectorConfig;
  private hookAdapter: ClaudeHookAdapter;
  private fileWatcher: FileWatcher | null = null;
  private aggregator: ChangeAggregator;
  private graph: CodeGraph | null = null;
  private stats: ChangeDetectorStats;

  constructor(config: Partial<ChangeDetectorConfig> & { rootDir: string }) {
    super();

    this.config = {
      useFileWatcher: true,
      watcher: {},
      aggregator: {},
      retainContent: false,
      ...config,
    };

    this.stats = {
      eventsReceived: 0,
      eventsFromHooks: 0,
      eventsFromWatcher: 0,
      analysisRuns: 0,
      totalFilesAnalyzed: 0,
      lastAnalysisMs: null,
    };

    // Initialize components
    this.hookAdapter = new ClaudeHookAdapter({
      retainContent: this.config.retainContent,
    });

    this.aggregator = new ChangeAggregator(this.config.aggregator);

    // Wire up events
    this.hookAdapter.on('change', (event: FileChangeEvent) => {
      this.handleChange(event);
    });

    this.aggregator.on('change', (event: FileChangeEvent) => {
      this.emit('change', event);
    });

    this.aggregator.on('analysis:start', (info) => {
      this.emit('analysis:start', info);
    });

    this.aggregator.on('analysis:complete', (result: AnalysisResult) => {
      this.stats.analysisRuns++;
      this.stats.totalFilesAnalyzed += result.analyzedFiles.length;
      this.stats.lastAnalysisMs = result.durationMs;
      this.emit('analysis:complete', result);
    });

    this.aggregator.on('change:recorded', (event: ChangeEvent) => {
      this.emit('change:recorded', event);
    });
  }

  /**
   * Start change detection
   */
  async start(): Promise<void> {
    // Start file watcher if enabled
    if (this.config.useFileWatcher) {
      this.fileWatcher = new FileWatcher({
        rootDir: this.config.rootDir,
        ...this.config.watcher,
      });

      this.fileWatcher.on('change', (event: FileChangeEvent) => {
        this.handleChange(event);
      });

      this.fileWatcher.on('ready', () => {
        this.emit('watcher:ready');
      });

      this.fileWatcher.start();
    }

    this.emit('started');
  }

  /**
   * Stop change detection
   */
  async stop(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }

    this.emit('stopped');
  }

  /**
   * Set the graph to update with analysis results
   */
  setGraph(graph: CodeGraph): void {
    this.graph = graph;
    this.aggregator.setGraph(graph);
  }

  /**
   * Process a hook event from stdin (for script mode)
   */
  processHookInput(jsonInput: string): FileChangeEvent | null {
    return this.hookAdapter.processHookInput(jsonInput);
  }

  /**
   * Handle a change event from any source
   */
  private handleChange(event: FileChangeEvent): void {
    this.stats.eventsReceived++;

    if (event.source === 'claude_hook') {
      this.stats.eventsFromHooks++;
    } else {
      this.stats.eventsFromWatcher++;
    }

    this.aggregator.addChange(event);
  }

  /**
   * Force immediate analysis of pending changes
   */
  async flush(): Promise<AnalysisResult | null> {
    return this.aggregator.flush();
  }

  /**
   * Get current stats
   */
  getStats(): ChangeDetectorStats {
    return { ...this.stats };
  }

  /**
   * Check if file watcher is active
   */
  isWatching(): boolean {
    return this.fileWatcher?.isWatching() ?? false;
  }

  /**
   * Get pending changes (not yet analyzed)
   */
  getPendingChanges() {
    return this.aggregator.getPendingChanges();
  }

  /**
   * Get change history with diffs
   */
  getChangeHistory(limit?: number): ChangeEvent[] {
    return this.aggregator.getChangeHistory(limit);
  }

  /**
   * Get a specific change event by ID
   */
  getChangeEvent(id: string): ChangeEvent | undefined {
    return this.aggregator.getChangeEvent(id);
  }
}

// ============================================
// Factory function
// ============================================

export function createChangeDetector(rootDir: string, graph?: CodeGraph): ChangeDetector {
  const detector = new ChangeDetector({ rootDir });
  if (graph) {
    detector.setGraph(graph);
  }
  return detector;
}
