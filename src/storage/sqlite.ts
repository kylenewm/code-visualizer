/**
 * SQLite Database Infrastructure
 * Manages database connection, schema, and transactions for the semantic observability system
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// ============================================
// Types
// ============================================

export interface DatabaseConfig {
  /** Path to SQLite database file */
  path: string;
  /** Enable WAL mode for better concurrent access */
  walMode: boolean;
  /** Busy timeout in milliseconds */
  busyTimeout: number;
  /** Enable foreign keys enforcement */
  foreignKeys: boolean;
}

export interface MigrationInfo {
  version: number;
  appliedAt: number;
  description: string;
}

// ============================================
// Schema Migrations
// ============================================

interface Migration {
  version: number;
  description: string;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Create annotation_versions table',
    up: `
      CREATE TABLE IF NOT EXISTS annotation_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('claude', 'manual')),
        created_at INTEGER NOT NULL,
        superseded_at INTEGER,
        superseded_by INTEGER REFERENCES annotation_versions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_annotation_versions_node_id
        ON annotation_versions(node_id);
      CREATE INDEX IF NOT EXISTS idx_annotation_versions_active
        ON annotation_versions(node_id, superseded_at)
        WHERE superseded_at IS NULL;
    `,
  },
  {
    version: 2,
    description: 'Create module_annotations table',
    up: `
      CREATE TABLE IF NOT EXISTS module_annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_path TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        function_count INTEGER NOT NULL,
        content_hashes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        superseded_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_module_annotations_path
        ON module_annotations(module_path);
      CREATE INDEX IF NOT EXISTS idx_module_annotations_active
        ON module_annotations(module_path, superseded_at)
        WHERE superseded_at IS NULL;
    `,
  },
  {
    version: 3,
    description: 'Create drift_events table',
    up: `
      CREATE TABLE IF NOT EXISTS drift_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        old_content_hash TEXT NOT NULL,
        new_content_hash TEXT NOT NULL,
        old_annotation_id INTEGER REFERENCES annotation_versions(id),
        detected_at INTEGER NOT NULL,
        drift_type TEXT CHECK(drift_type IN ('implementation', 'semantic', 'unknown')),
        severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
        resolved_at INTEGER,
        resolution TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_drift_events_node_id
        ON drift_events(node_id);
      CREATE INDEX IF NOT EXISTS idx_drift_events_unresolved
        ON drift_events(resolved_at)
        WHERE resolved_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_drift_events_severity
        ON drift_events(severity, resolved_at);
    `,
  },
  {
    version: 4,
    description: 'Create schema_migrations tracking table',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    description: 'Add stable_id column for annotation stability across signature changes',
    up: `
      -- Add stable_id to annotation_versions
      ALTER TABLE annotation_versions ADD COLUMN stable_id TEXT;

      -- Backfill stable_id by stripping the last segment (sigHash) from node_id
      -- node_id format: fileHash:kind:name:sigHash -> stable_id: fileHash:kind:name
      UPDATE annotation_versions
      SET stable_id = substr(node_id, 1, length(node_id) - 9)
      WHERE stable_id IS NULL;

      -- Create index for stable_id lookups
      CREATE INDEX IF NOT EXISTS idx_annotation_versions_stable_id
        ON annotation_versions(stable_id);
      CREATE INDEX IF NOT EXISTS idx_annotation_versions_stable_active
        ON annotation_versions(stable_id, superseded_at)
        WHERE superseded_at IS NULL;

      -- Add stable_id to drift_events
      ALTER TABLE drift_events ADD COLUMN stable_id TEXT;

      -- Backfill drift_events stable_id
      UPDATE drift_events
      SET stable_id = substr(node_id, 1, length(node_id) - 9)
      WHERE stable_id IS NULL;

      -- Create index for drift stable_id lookups
      CREATE INDEX IF NOT EXISTS idx_drift_events_stable_id
        ON drift_events(stable_id);
    `,
  },
  {
    version: 6,
    description: 'Create touched_functions table for tracking edited functions',
    up: `
      CREATE TABLE IF NOT EXISTS touched_functions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stable_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        touched_at INTEGER NOT NULL,
        change_id TEXT,
        annotated_at INTEGER,
        UNIQUE(stable_id, touched_at)
      );

      CREATE INDEX IF NOT EXISTS idx_touched_pending
        ON touched_functions(annotated_at)
        WHERE annotated_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_touched_stable_id
        ON touched_functions(stable_id);
    `,
  },
  {
    version: 7,
    description: 'Add concept shift detection columns to drift_events',
    up: `
      -- Add concept_shifted boolean to track if purpose changed
      ALTER TABLE drift_events ADD COLUMN concept_shifted INTEGER DEFAULT NULL;

      -- Add shift_reason to explain what conceptually changed
      ALTER TABLE drift_events ADD COLUMN shift_reason TEXT DEFAULT NULL;

      -- Index for finding concept shifts
      CREATE INDEX IF NOT EXISTS idx_drift_events_concept_shifted
        ON drift_events(concept_shifted)
        WHERE concept_shifted = 1;
    `,
  },
];

// ============================================
// Database Manager
// ============================================

export class DatabaseManager {
  private db: DatabaseType | null = null;
  private config: DatabaseConfig;
  private preparedStatements = new Map<string, Statement>();

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: '.codeflow/observability.db',
      walMode: true,
      busyTimeout: 5000,
      foreignKeys: true,
      ...config,
    };
  }

  /**
   * Initialize the database connection and run migrations
   */
  initialize(): void {
    if (this.db) {
      return; // Already initialized
    }

    // Ensure directory exists
    const dbDir = dirname(this.config.path);
    if (dbDir && !existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.config.path);

    // Configure database
    if (this.config.walMode) {
      this.db.pragma('journal_mode = WAL');
    }
    if (this.config.busyTimeout) {
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    }
    if (this.config.foreignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('cache_size = -64000'); // 64MB cache

    // Run migrations
    this.runMigrations();
  }

  /**
   * Get the database connection
   */
  getDb(): DatabaseType {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a function within a transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDb();
    return db.transaction(fn)();
  }

  /**
   * Get or create a prepared statement
   */
  prepare(sql: string): Statement {
    let stmt = this.preparedStatements.get(sql);
    if (!stmt) {
      stmt = this.getDb().prepare(sql);
      this.preparedStatements.set(sql, stmt);
    }
    return stmt;
  }

  /**
   * Run schema migrations
   */
  private runMigrations(): void {
    const db = this.getDb();

    // Create migrations table first (always safe to run)
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT NOT NULL
      );
    `);

    // Get current version
    const currentVersion = db.prepare(
      'SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations'
    ).get() as { version: number };

    // Run pending migrations
    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion.version) {
        continue;
      }

      // Skip the migrations table creation migration if it's already created
      if (migration.version === 4) {
        continue;
      }

      db.transaction(() => {
        // Run migration
        db.exec(migration.up);

        // Record migration
        db.prepare(
          'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)'
        ).run(migration.version, Date.now(), migration.description);
      })();

      console.log(`Migration ${migration.version}: ${migration.description}`);
    }
  }

  /**
   * Get applied migrations
   */
  getMigrations(): MigrationInfo[] {
    const db = this.getDb();
    return db.prepare(
      'SELECT version, applied_at as appliedAt, description FROM schema_migrations ORDER BY version'
    ).all() as MigrationInfo[];
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      // Clear prepared statements
      this.preparedStatements.clear();

      // Checkpoint WAL before closing
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // Ignore checkpoint errors on close
      }

      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Get database file path
   */
  getPath(): string {
    return this.config.path;
  }

  /**
   * Get database statistics
   */
  getStats(): {
    size: number;
    walSize: number;
    pageCount: number;
    pageSize: number;
  } {
    const db = this.getDb();
    const pageCount = (db.pragma('page_count') as { page_count: number }[])[0]?.page_count ?? 0;
    const pageSize = (db.pragma('page_size') as { page_size: number }[])[0]?.page_size ?? 4096;

    return {
      size: pageCount * pageSize,
      walSize: 0, // Would need fs.stat to get actual WAL size
      pageCount,
      pageSize,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let defaultInstance: DatabaseManager | null = null;

/**
 * Get the default database instance
 */
export function getDatabase(): DatabaseManager {
  if (!defaultInstance) {
    defaultInstance = new DatabaseManager();
  }
  return defaultInstance;
}

/**
 * Initialize the default database with custom config
 */
export function initDatabase(config: Partial<DatabaseConfig> = {}): DatabaseManager {
  if (defaultInstance?.isInitialized()) {
    return defaultInstance;
  }

  defaultInstance = new DatabaseManager(config);
  defaultInstance.initialize();
  return defaultInstance;
}

/**
 * Close the default database
 */
export function closeDatabase(): void {
  if (defaultInstance) {
    defaultInstance.close();
    defaultInstance = null;
  }
}
