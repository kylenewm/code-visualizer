/**
 * Hooks module exports
 */

export { ClaudeHookAdapter, runAsHookScript } from './adapter.js';
export type { HookInput, FileChangeEvent, HookAdapterConfig } from './adapter.js';

export { FileWatcher } from './file-watcher.js';
export type { FileWatcherConfig } from './file-watcher.js';

export { ChangeAggregator } from './change-aggregator.js';
export type { ChangeAggregatorConfig, AggregatedChange, AnalysisResult, ChangeEvent } from './change-aggregator.js';

export { ChangeDetector, createChangeDetector } from './change-detector.js';
export type { ChangeDetectorConfig, ChangeDetectorStats } from './change-detector.js';
