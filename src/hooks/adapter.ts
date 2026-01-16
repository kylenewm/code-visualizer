/**
 * Claude Hook Adapter
 * Receives PostToolUse events from Claude Code hooks and emits file change events
 *
 * Claude Code hooks are shell scripts that receive JSON on stdin:
 * - PostToolUse: { session_id, tool_name, tool_input: { file_path, content? } }
 */

import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

export interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: {
    file_path?: string;
    content?: string;
    command?: string;
  };
}

export interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete';
  filePath: string;
  source: 'claude_hook' | 'fs_watcher';
  sessionId?: string;
  timestamp: number;
  content?: string;  // Only if retention allows
}

export interface HookAdapterConfig {
  /** Store file content in events (privacy consideration) */
  retainContent: boolean;
  /** File patterns to ignore (glob patterns) */
  ignorePatterns: string[];
}

// ============================================
// Hook Adapter
// ============================================

export class ClaudeHookAdapter extends EventEmitter {
  private config: HookAdapterConfig;
  private sessionId: string | null = null;

  constructor(config: Partial<HookAdapterConfig> = {}) {
    super();
    this.config = {
      retainContent: false,  // Don't retain by default for privacy
      ignorePatterns: ['node_modules/**', '.git/**', '*.log'],
      ...config,
    };
  }

  /**
   * Process raw JSON input from Claude hook stdin
   */
  processHookInput(jsonInput: string): FileChangeEvent | null {
    try {
      const input = JSON.parse(jsonInput) as HookInput;
      return this.handleHookEvent(input);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse hook input: ${error}`));
      return null;
    }
  }

  /**
   * Handle a parsed hook event
   */
  handleHookEvent(input: HookInput): FileChangeEvent | null {
    // Track session
    if (input.session_id) {
      this.sessionId = input.session_id;
    }

    // Only process file-related tools
    const fileTools = ['Write', 'Edit', 'MultiEdit'];
    if (!fileTools.includes(input.tool_name)) {
      return null;
    }

    const filePath = input.tool_input?.file_path;
    if (!filePath) {
      return null;
    }

    // Check ignore patterns
    if (this.shouldIgnore(filePath)) {
      return null;
    }

    const event: FileChangeEvent = {
      type: this.determineChangeType(input.tool_name),
      filePath,
      source: 'claude_hook',
      sessionId: this.sessionId ?? undefined,
      timestamp: Date.now(),
    };

    // Only include content if configured and available
    if (this.config.retainContent && input.tool_input?.content) {
      event.content = input.tool_input.content;
    }

    this.emit('change', event);
    return event;
  }

  private determineChangeType(toolName: string): 'create' | 'modify' | 'delete' {
    // Write can create or overwrite
    // Edit always modifies
    // For now, treat all as 'modify' since we can't tell if file existed
    return 'modify';
  }

  private shouldIgnore(filePath: string): boolean {
    for (const pattern of this.config.ignorePatterns) {
      if (this.matchGlob(pattern, filePath)) {
        return true;
      }
    }
    return false;
  }

  private matchGlob(pattern: string, path: string): boolean {
    // Simple glob matching for common patterns
    // Handle patterns that should match anywhere in path (like node_modules/**)
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars
      .replace(/\*\*/g, '.*')                  // ** matches anything
      .replace(/\*/g, '[^/]*');                // * matches within segment

    // Allow pattern to match anywhere in the path (not just from start)
    return new RegExp(regexPattern).test(path);
  }

  /**
   * Get current session ID (if any)
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

// ============================================
// Hook Script Entry Point
// ============================================

/**
 * Check for CodeFlow violations and report them to Claude
 * Called after processing file changes to provide proactive feedback
 */
async function checkAndReportViolations(_filePath: string): Promise<void> {
  try {
    const response = await fetch('http://localhost:3001/api/rules/evaluate', {
      method: 'POST',
    });

    if (!response.ok) return;

    const data = await response.json() as {
      violationCount: number;
      violations: Array<{
        ruleName: string;
        targets: Array<{ name: string; reason: string }>;
      }>;
    };

    if (data.violationCount > 0) {
      // Output to stderr so Claude sees it
      console.error(`\n[CodeFlow] ${data.violationCount} violation(s) detected:`);
      for (const v of data.violations.slice(0, 3)) {
        console.error(`  - ${v.ruleName}: ${v.targets.length} issue(s)`);
      }
      if (data.violations.length > 3) {
        console.error(`  ... and ${data.violations.length - 3} more`);
      }
      console.error(`Run 'evaluate_rules' MCP tool for details.\n`);
    }
  } catch {
    // Server not running, silently skip
  }
}

/**
 * Read stdin and process as hook input
 * Used when this module is run as a Claude hook script
 */
export async function runAsHookScript(): Promise<void> {
  const adapter = new ClaudeHookAdapter();

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    return;
  }

  const event = adapter.processHookInput(input);
  if (event) {
    // Output event as JSON for downstream processing
    console.log(JSON.stringify(event));

    // Check for violations and report to Claude
    await checkAndReportViolations(event.filePath);
  }
}

// Run as script if executed directly
if (process.argv[1]?.endsWith('adapter.js')) {
  runAsHookScript().catch(console.error);
}
