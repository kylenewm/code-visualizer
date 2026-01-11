/**
 * Unit tests for the analyzer pipeline
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeProject, analyzeSourceCode } from '../src/analyzer/pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TS_FIXTURES_DIR = join(__dirname, 'fixtures', 'sample-project');
const PY_FIXTURES_DIR = join(__dirname, 'fixtures', 'python-project');

describe('AnalysisPipeline', () => {
  describe('analyzeSourceCode', () => {
    it('extracts functions from source', () => {
      const source = `
        export function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }

        function helper() {
          return 42;
        }
      `;

      const { nodes } = analyzeSourceCode(source, 'test.ts');

      const functions = nodes.filter(n => n.kind === 'function');
      expect(functions.length).toBe(2);

      const greet = functions.find(f => f.name === 'greet');
      expect(greet).toBeDefined();
      expect(greet?.exported).toBe(true);
      expect(greet?.signature).toContain('name');

      const helper = functions.find(f => f.name === 'helper');
      expect(helper).toBeDefined();
      expect(helper?.exported).toBe(false);
    });

    it('extracts arrow functions assigned to variables', () => {
      const source = `
        const add = (a: number, b: number) => a + b;
        export const multiply = (a: number, b: number) => a * b;
      `;

      const { nodes } = analyzeSourceCode(source, 'math.ts');
      const functions = nodes.filter(n => n.kind === 'function');

      expect(functions.length).toBe(2);
      expect(functions.map(f => f.name)).toContain('add');
      expect(functions.map(f => f.name)).toContain('multiply');
    });

    it('extracts classes and methods', () => {
      const source = `
        export class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }

          subtract(a: number, b: number): number {
            return a - b;
          }
        }
      `;

      const { nodes } = analyzeSourceCode(source, 'calculator.ts');

      const classes = nodes.filter(n => n.kind === 'class');
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('Calculator');

      const methods = nodes.filter(n => n.kind === 'method');
      expect(methods.length).toBeGreaterThanOrEqual(2);
      expect(methods.map(m => m.name)).toContain('add');
      expect(methods.map(m => m.name)).toContain('subtract');
    });

    it('extracts imports', () => {
      const source = `
        import { foo, bar } from './utils';
        import defaultExport from './other';
        import * as all from './all';

        function test() {
          foo();
        }
      `;

      const { edges } = analyzeSourceCode(source, 'test.ts');
      const imports = edges.filter(e => e.type === 'imports');

      expect(imports.length).toBe(3);
      expect(imports.map(i => i.label)).toContain('./utils');
      expect(imports.map(i => i.label)).toContain('./other');
      expect(imports.map(i => i.label)).toContain('./all');
    });

    it('extracts local function calls', () => {
      const source = `
        function helper() {
          return 42;
        }

        function main() {
          const x = helper();
          return x * 2;
        }
      `;

      const { graph } = analyzeSourceCode(source, 'test.ts');

      const mainNode = graph.searchNodes('main')[0];
      const helperNode = graph.searchNodes('helper')[0];

      expect(mainNode).toBeDefined();
      expect(helperNode).toBeDefined();

      // main should call helper
      const callees = graph.findCallees(mainNode.id);
      expect(callees.map(c => c.name)).toContain('helper');

      // helper should be called by main
      const callers = graph.findCallers(helperNode.id);
      expect(callers.map(c => c.name)).toContain('main');
    });

    it('extracts class instantiation', () => {
      const source = `
        class MyClass {
          constructor() {}
        }

        function create() {
          return new MyClass();
        }
      `;

      const { edges } = analyzeSourceCode(source, 'test.ts');
      const instantiations = edges.filter(e => e.type === 'instantiates');

      expect(instantiations.length).toBe(1);
    });
  });

  describe('Graph Queries', () => {
    it('finds callers and callees', () => {
      const source = `
        function a() { b(); }
        function b() { c(); }
        function c() { return 1; }
      `;

      const { graph } = analyzeSourceCode(source, 'chain.ts');

      const aNode = graph.searchNodes('a')[0];
      const bNode = graph.searchNodes('b')[0];
      const cNode = graph.searchNodes('c')[0];

      expect(aNode).toBeDefined();
      expect(bNode).toBeDefined();
      expect(cNode).toBeDefined();

      // a calls b
      const aCallees = graph.findCallees(aNode.id);
      expect(aCallees.map(n => n.name)).toContain('b');

      // b is called by a, calls c
      const bCallers = graph.findCallers(bNode.id);
      expect(bCallers.map(n => n.name)).toContain('a');

      const bCallees = graph.findCallees(bNode.id);
      expect(bCallees.map(n => n.name)).toContain('c');

      // c is called by b
      const cCallers = graph.findCallers(cNode.id);
      expect(cCallers.map(n => n.name)).toContain('b');
    });

    it('generates call chains', () => {
      const source = `
        function entry() { step1(); }
        function step1() { step2(); }
        function step2() { step3(); }
        function step3() { return 'done'; }
      `;

      const { graph } = analyzeSourceCode(source, 'chain.ts');

      const entryNode = graph.searchNodes('entry')[0];
      const chain = graph.getCallChain(entryNode.id, 10);

      // entry->step1, step1->step2, step2->step3
      expect(chain.chain.length).toBe(3);
    });

    it('searches nodes by name', () => {
      const source = `
        function getUserById() {}
        function getUserByEmail() {}
        function createUser() {}
        function deleteUser() {}
      `;

      const { graph } = analyzeSourceCode(source, 'users.ts');

      // Searching for 'user' will also match the module node 'users'
      const userFuncs = graph.searchNodes('user');
      expect(userFuncs.length).toBeGreaterThanOrEqual(4);

      const getFuncs = graph.searchNodes('get');
      expect(getFuncs.length).toBe(2);
    });

    it('gets neighborhood subgraph', () => {
      const source = `
        function a() { b(); }
        function b() { c(); d(); }
        function c() { e(); }
        function d() {}
        function e() {}
      `;

      const { graph } = analyzeSourceCode(source, 'test.ts');

      const bNode = graph.searchNodes('b')[0];
      const neighborhood = graph.getNeighborhood(bNode.id, 1);

      // 1-hop from b should include: b, a (caller), c (callee), d (callee)
      const names = neighborhood.nodes.map(n => n.name);
      expect(names).toContain('b');
      expect(names).toContain('a');
      expect(names).toContain('c');
      expect(names).toContain('d');
    });
  });

  describe('Python Support', () => {
    it('extracts Python functions', () => {
      const source = `
def greet(name: str) -> str:
    """Greet someone"""
    return f"Hello, {name}!"

def _private_helper():
    return 42
      `;

      const { nodes } = analyzeSourceCode(source, 'test.py');
      const functions = nodes.filter(n => n.kind === 'function');

      expect(functions.length).toBe(2);

      const greet = functions.find(f => f.name === 'greet');
      expect(greet).toBeDefined();
      expect(greet?.exported).toBe(true);
      expect(greet?.signature).toContain('name');

      const helper = functions.find(f => f.name === '_private_helper');
      expect(helper).toBeDefined();
      expect(helper?.exported).toBe(false);  // _ prefix = private
    });

    it('extracts Python classes and methods', () => {
      const source = `
class Calculator:
    """A simple calculator"""

    def add(self, a: int, b: int) -> int:
        return a + b

    def subtract(self, a: int, b: int) -> int:
        return a - b
      `;

      const { nodes } = analyzeSourceCode(source, 'calc.py');

      const classes = nodes.filter(n => n.kind === 'class');
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('Calculator');

      const methods = nodes.filter(n => n.kind === 'method');
      expect(methods.length).toBe(2);
      expect(methods.map(m => m.name)).toContain('add');
      expect(methods.map(m => m.name)).toContain('subtract');
    });

    it('extracts Python imports', () => {
      const source = `
from typing import Optional, List
from .utils import hash_password
import hashlib
import uuid as unique_id
      `;

      const { edges } = analyzeSourceCode(source, 'test.py');
      const imports = edges.filter(e => e.type === 'imports');

      expect(imports.length).toBe(4);
      expect(imports.map(i => i.label)).toContain('typing');
      expect(imports.map(i => i.label)).toContain('.utils');
      expect(imports.map(i => i.label)).toContain('hashlib');
      expect(imports.map(i => i.label)).toContain('uuid');
    });

    it('extracts Python function calls', () => {
      const source = `
def helper():
    return 42

def main():
    x = helper()
    return x * 2
      `;

      const { graph } = analyzeSourceCode(source, 'test.py');

      const mainNode = graph.searchNodes('main')[0];
      const helperNode = graph.searchNodes('helper')[0];

      expect(mainNode).toBeDefined();
      expect(helperNode).toBeDefined();

      const callees = graph.findCallees(mainNode.id);
      expect(callees.map(c => c.name)).toContain('helper');
    });

    it('analyzes Python project directory', async () => {
      const { graph, result } = await analyzeProject(PY_FIXTURES_DIR);

      expect(result.files.length).toBeGreaterThan(0);

      const stats = graph.getStats();
      expect(stats.functionCount).toBeGreaterThan(0);

      // Check specific functions exist
      const loginFuncs = graph.searchNodes('login');
      expect(loginFuncs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('analyzeProject', () => {
    it('analyzes a directory of files', async () => {
      const { graph, result } = await analyzeProject(TS_FIXTURES_DIR);

      // Should find files
      expect(result.files.length).toBeGreaterThan(0);

      // Should find functions
      const stats = graph.getStats();
      expect(stats.functionCount).toBeGreaterThan(0);

      // Check specific functions exist
      const loginFuncs = graph.searchNodes('login');
      expect(loginFuncs.length).toBeGreaterThanOrEqual(1);
    });

    it('reports timing', async () => {
      const { result } = await analyzeProject(TS_FIXTURES_DIR);

      expect(result.timing.endMs - result.timing.startMs).toBeGreaterThanOrEqual(0);
    });

    it('reports no errors for valid code', async () => {
      const { result } = await analyzeProject(TS_FIXTURES_DIR);
      expect(result.errors.length).toBe(0);
    });
  });
});
