/**
 * Unit tests for the hooks/change detection system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeHookAdapter, type FileChangeEvent } from '../src/hooks/adapter.js';
import { ChangeAggregator } from '../src/hooks/change-aggregator.js';

describe('ClaudeHookAdapter', () => {
  let adapter: ClaudeHookAdapter;

  beforeEach(() => {
    adapter = new ClaudeHookAdapter();
  });

  describe('processHookInput', () => {
    it('parses valid Write tool event', () => {
      const input = JSON.stringify({
        session_id: 'sess-123',
        tool_name: 'Write',
        tool_input: {
          file_path: '/path/to/file.ts',
          content: 'console.log("hello");',
        },
      });

      const event = adapter.processHookInput(input);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('modify');
      expect(event?.filePath).toBe('/path/to/file.ts');
      expect(event?.source).toBe('claude_hook');
      expect(event?.sessionId).toBe('sess-123');
    });

    it('parses valid Edit tool event', () => {
      const input = JSON.stringify({
        session_id: 'sess-456',
        tool_name: 'Edit',
        tool_input: {
          file_path: '/path/to/file.py',
        },
      });

      const event = adapter.processHookInput(input);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('modify');
      expect(event?.filePath).toBe('/path/to/file.py');
    });

    it('ignores non-file tools', () => {
      const input = JSON.stringify({
        session_id: 'sess-789',
        tool_name: 'Bash',
        tool_input: {
          command: 'ls -la',
        },
      });

      const event = adapter.processHookInput(input);
      expect(event).toBeNull();
    });

    it('ignores node_modules paths', () => {
      const input = JSON.stringify({
        session_id: 'sess-123',
        tool_name: 'Write',
        tool_input: {
          file_path: '/path/to/node_modules/pkg/index.js',
        },
      });

      const event = adapter.processHookInput(input);
      expect(event).toBeNull();
    });

    it('ignores .git paths', () => {
      const input = JSON.stringify({
        session_id: 'sess-123',
        tool_name: 'Write',
        tool_input: {
          file_path: '/path/to/.git/config',
        },
      });

      const event = adapter.processHookInput(input);
      expect(event).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      // Suppress error event for this test
      adapter.on('error', () => {});
      const event = adapter.processHookInput('not json');
      expect(event).toBeNull();
    });

    it('emits change event', () => {
      const events: FileChangeEvent[] = [];
      adapter.on('change', (e: FileChangeEvent) => events.push(e));

      const input = JSON.stringify({
        session_id: 'sess-123',
        tool_name: 'Write',
        tool_input: { file_path: '/test.ts' },
      });

      adapter.processHookInput(input);

      expect(events.length).toBe(1);
      expect(events[0].filePath).toBe('/test.ts');
    });

    it('tracks session ID', () => {
      const input = JSON.stringify({
        session_id: 'my-session',
        tool_name: 'Write',
        tool_input: { file_path: '/test.ts' },
      });

      adapter.processHookInput(input);
      expect(adapter.getSessionId()).toBe('my-session');
    });
  });

  describe('content retention', () => {
    it('does not include content by default', () => {
      const input = JSON.stringify({
        session_id: 'sess',
        tool_name: 'Write',
        tool_input: {
          file_path: '/test.ts',
          content: 'secret code',
        },
      });

      const event = adapter.processHookInput(input);
      expect(event?.content).toBeUndefined();
    });

    it('includes content when configured', () => {
      const adapterWithRetention = new ClaudeHookAdapter({ retainContent: true });

      const input = JSON.stringify({
        session_id: 'sess',
        tool_name: 'Write',
        tool_input: {
          file_path: '/test.ts',
          content: 'public code',
        },
      });

      const event = adapterWithRetention.processHookInput(input);
      expect(event?.content).toBe('public code');
    });
  });
});

describe('ChangeAggregator', () => {
  let aggregator: ChangeAggregator;

  beforeEach(() => {
    aggregator = new ChangeAggregator({
      aggregationWindowMs: 50,  // Short window for tests
    });
  });

  afterEach(() => {
    aggregator.clear();
  });

  describe('addChange', () => {
    it('emits change event immediately', () => {
      const events: FileChangeEvent[] = [];
      aggregator.on('change', (e: FileChangeEvent) => events.push(e));

      aggregator.addChange({
        type: 'modify',
        filePath: '/test.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      expect(events.length).toBe(1);
    });

    it('aggregates multiple changes to same file', () => {
      aggregator.addChange({
        type: 'create',
        filePath: '/test.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      aggregator.addChange({
        type: 'modify',
        filePath: '/test.ts',
        source: 'fs_watcher',
        timestamp: Date.now() + 10,
      });

      const pending = aggregator.getPendingChanges();
      expect(pending.length).toBe(1);
      expect(pending[0].lastType).toBe('modify');
      expect(pending[0].source).toBe('mixed');
      expect(pending[0].eventCount).toBe(2);
    });

    it('tracks multiple files separately', () => {
      aggregator.addChange({
        type: 'modify',
        filePath: '/a.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      aggregator.addChange({
        type: 'modify',
        filePath: '/b.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      const pending = aggregator.getPendingChanges();
      expect(pending.length).toBe(2);
    });
  });

  describe('flush', () => {
    it('returns null when no pending changes', async () => {
      const result = await aggregator.flush();
      expect(result).toBeNull();
    });

    it('clears pending changes after flush', async () => {
      aggregator.addChange({
        type: 'modify',
        filePath: '/nonexistent.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      // Flush will fail to analyze but should still clear pending
      await aggregator.flush();

      const pending = aggregator.getPendingChanges();
      expect(pending.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('clears pending changes without analysis', () => {
      aggregator.addChange({
        type: 'modify',
        filePath: '/test.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      expect(aggregator.getPendingChanges().length).toBe(1);

      aggregator.clear();

      expect(aggregator.getPendingChanges().length).toBe(0);
    });
  });

  describe('analysis events', () => {
    it('emits analysis:start event', async () => {
      const startEvents: unknown[] = [];
      aggregator.on('analysis:start', (info) => startEvents.push(info));

      aggregator.addChange({
        type: 'modify',
        filePath: '/nonexistent.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      // Wait for aggregation window
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startEvents.length).toBe(1);
    });

    it('emits analysis:complete event', async () => {
      const completeEvents: unknown[] = [];
      aggregator.on('analysis:complete', (result) => completeEvents.push(result));

      aggregator.addChange({
        type: 'delete',
        filePath: '/deleted.ts',
        source: 'claude_hook',
        timestamp: Date.now(),
      });

      // Wait for analysis
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(completeEvents.length).toBe(1);
    });
  });
});
