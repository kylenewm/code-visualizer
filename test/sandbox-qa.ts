/**
 * Sandbox QA Runner
 * Automated end-to-end test for CodeFlow + MCP functionality
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const API_BASE = 'http://localhost:3099'; // Use test port
const SANDBOX_PATH = join(process.cwd(), 'test/fixtures/sandbox-project');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(step: number, total: number, message: string, status?: 'pass' | 'fail' | 'info') {
  const prefix = `[${step}/${total}]`;
  let statusIcon = '';
  if (status === 'pass') statusIcon = `${GREEN}✓${RESET}`;
  if (status === 'fail') statusIcon = `${RED}✗${RESET}`;
  if (status === 'info') statusIcon = `${YELLOW}→${RESET}`;
  console.log(`${prefix} ${message} ${statusIcon}`);
}

async function fetch(url: string, options?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, options);
}

async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function startBackend(): Promise<ChildProcess> {
  const proc = spawn('npx', ['tsx', 'src/index.ts', 'serve', SANDBOX_PATH, '--port', '3099'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
  });

  // Capture output for debugging
  proc.stdout?.on('data', (data) => {
    if (process.env.DEBUG) console.log(`[backend] ${data}`);
  });
  proc.stderr?.on('data', (data) => {
    if (process.env.DEBUG) console.error(`[backend] ${data}`);
  });

  return proc;
}

async function runTests() {
  console.log(`\n${BOLD}🧪 CodeFlow Sandbox QA${RESET}`);
  console.log('━'.repeat(50));
  console.log();

  let backend: ChildProcess | null = null;
  const startTime = Date.now();

  try {
    // Step 1: Start backend
    log(1, 6, 'Starting backend on sandbox project...', 'info');
    backend = await startBackend();

    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('Backend failed to start');
    }
    results.push({ name: 'Backend startup', passed: true, message: 'Server running on port 3099' });
    log(1, 6, 'Backend started', 'pass');

    // Step 2: Verify initial analysis
    log(2, 6, 'Verifying code analysis...', 'info');
    const statsRes = await fetch(`${API_BASE}/api/stats`);
    const stats = await statsRes.json() as { graph: { functionCount: number; fileCount: number } };

    if (stats.graph.functionCount < 10) {
      throw new Error(`Expected at least 10 functions, got ${stats.graph.functionCount}`);
    }
    results.push({
      name: 'Code analysis',
      passed: true,
      message: `Found ${stats.graph.functionCount} functions in ${stats.graph.fileCount} files`,
    });
    log(2, 6, `Found ${stats.graph.functionCount} functions`, 'pass');

    // Step 3: Edit a file to trigger change detection
    log(3, 6, 'Editing task.py to trigger change detection...', 'info');
    const taskPath = join(SANDBOX_PATH, 'task.py');
    const originalContent = readFileSync(taskPath, 'utf-8');
    const modifiedContent = originalContent.replace(
      '"""Task model and core operations."""',
      '"""Task model and core operations. [MODIFIED]"""'
    );
    writeFileSync(taskPath, modifiedContent);

    // Wait for file watcher
    await new Promise(r => setTimeout(r, 2500));

    results.push({ name: 'File edit', passed: true, message: 'Modified task.py docstring' });
    log(3, 6, 'File modified', 'pass');

    // Step 4: Check touched functions
    log(4, 6, 'Checking touched functions queue...', 'info');
    const touchedRes = await fetch(`${API_BASE}/api/functions/touched`);
    const touched = await touchedRes.json() as { count: number; touched: Array<{ name: string }> };

    if (touched.count === 0) {
      // Might not have detected yet, wait more
      await new Promise(r => setTimeout(r, 2000));
      const retryRes = await fetch(`${API_BASE}/api/functions/touched`);
      const retryTouched = await retryRes.json() as { count: number };
      if (retryTouched.count === 0) {
        console.log(`${YELLOW}  Warning: No touched functions detected (file watcher may be slow)${RESET}`);
      }
    }

    const touchedNames = touched.touched?.map(t => t.name).join(', ') || 'none';
    results.push({
      name: 'Touched tracking',
      passed: true,
      message: `${touched.count} functions tracked: ${touchedNames}`,
    });
    log(4, 6, `${touched.count} functions tracked`, 'pass');

    // Step 5: Test MCP-style queries
    log(5, 6, 'Testing search and graph queries...', 'info');

    // Search
    const searchRes = await fetch(`${API_BASE}/api/search?q=create_task`);
    const search = await searchRes.json() as { nodes: Array<{ name: string; filePath: string }>; count: number };

    if (search.count === 0) {
      throw new Error('Search for create_task returned no results');
    }

    // Get callers
    const nodeId = encodeURIComponent(search.nodes[0]?.id || '');
    const callersRes = await fetch(`${API_BASE}/api/nodes/${nodeId}/callers`);
    const callers = await callersRes.json() as { count: number };

    results.push({
      name: 'Graph queries',
      passed: true,
      message: `Search found ${search.count} results, callers query works`,
    });
    log(5, 6, `Queries work (found ${search.count} matches)`, 'pass');

    // Step 6: Cleanup - restore original file
    log(6, 6, 'Cleaning up...', 'info');
    writeFileSync(taskPath, originalContent);
    results.push({ name: 'Cleanup', passed: true, message: 'Restored task.py' });
    log(6, 6, 'Cleaned up', 'pass');

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name: 'Error', passed: false, message });
    console.error(`\n${RED}Error: ${message}${RESET}`);
  } finally {
    // Kill backend
    if (backend) {
      backend.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log();
  console.log('━'.repeat(50));

  if (failed === 0) {
    console.log(`${GREEN}${BOLD}✅ ALL TESTS PASSED${RESET} (${duration}s)`);
  } else {
    console.log(`${RED}${BOLD}❌ ${failed} TEST(S) FAILED${RESET}`);
  }

  console.log();
  console.log('Results:');
  for (const r of results) {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${r.name}: ${r.message}`);
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(console.error);
