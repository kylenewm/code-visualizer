/**
 * Storage Module Exports
 * Provides unified access to all storage components
 */

export {
  DatabaseManager,
  getDatabase,
  initDatabase,
  closeDatabase,
  type DatabaseConfig,
  type MigrationInfo,
} from './sqlite.js';

export {
  AnnotationStore,
  getAnnotationStore,
  type AnnotationVersion,
  type AnnotationSummary,
  type SaveAnnotationResult,
} from './annotation-store.js';

export {
  ModuleStore,
  getModuleStore,
  type ModuleAnnotation,
  type ModuleAnnotationInput,
  type ModuleStalenessInfo,
} from './module-store.js';

export {
  DriftStore,
  getDriftStore,
  type DriftEvent,
  type DriftEventInput,
  type DriftStats,
} from './drift-store.js';
