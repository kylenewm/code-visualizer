/**
 * File Watcher (Fallback)
 * Uses chokidar to watch for file changes when Claude hooks aren't available
 */

import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import type { FileChangeEvent } from './adapter.js';

// ============================================
// Types
// ============================================

export interface FileWatcherConfig {
  /** Root directory to watch */
  rootDir: string;
  /** File extensions to include (e.g., ['.ts', '.tsx', '.js', '.jsx', '.py']) */
  includeExtensions: string[];
  /** Directory names to ignore (e.g., ['node_modules', '.git', 'dist']) */
  ignoreDirs: string[];
  /** Debounce interval in ms (default: 500) */
  debounceMs: number;
  /** Use polling for network filesystems */
  usePolling: boolean;
}

// ============================================
// File Watcher
// ============================================

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: FileWatcherConfig;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<FileWatcherConfig> & { rootDir: string }) {
    super();
    this.config = {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py'],
      ignoreDirs: ['node_modules', '.git', 'dist', 'build'],
      debounceMs: 500,
      usePolling: false,
      ...config,
    };
  }

  /**
   * Check if a file path should be included based on extension
   */
  private shouldInclude(filePath: string): boolean {
    return this.config.includeExtensions.some((ext) => filePath.endsWith(ext));
  }

  /**
   * Start watching for file changes
   * Note: We watch the root directory instead of glob patterns because
   * chokidar's glob pattern watching doesn't reliably detect changes on macOS.
   */
  start(): void {
    if (this.watcher) {
      return; // Already watching
    }

    // Build ignored regex from directory names
    const ignoredPattern = new RegExp(
      `(${this.config.ignoreDirs.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
      'i'
    );

    this.watcher = watch(this.config.rootDir, {
      ignored: (path) => {
        // Always ignore certain patterns
        if (path.includes('/.') && !path.includes('/.env')) return true;
        if (ignoredPattern.test(path)) return true;
        return false;
      },
      persistent: true,
      ignoreInitial: true,  // Don't emit events for existing files
      usePolling: this.config.usePolling,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (path) => this.handleChange('create', path));
    this.watcher.on('change', (path) => this.handleChange('modify', path));
    this.watcher.on('unlink', (path) => this.handleChange('delete', path));
    this.watcher.on('error', (error) => this.emit('error', error));

    this.emit('ready');
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Handle a file change with debouncing
   */
  private handleChange(type: 'create' | 'modify' | 'delete', filePath: string): void {
    // Filter by extension - only process files we care about
    if (!this.shouldInclude(filePath)) {
      return;
    }

    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);

      const event: FileChangeEvent = {
        type,
        filePath,
        source: 'fs_watcher',
        timestamp: Date.now(),
      };

      this.emit('change', event);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }
}
