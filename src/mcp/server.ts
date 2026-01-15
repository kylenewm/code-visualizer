/**
 * CodeFlow MCP Server
 * Exposes code graph queries to Claude via Model Context Protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.CODEFLOW_API || 'http://localhost:3001';

// Helper to fetch from CodeFlow API
async function fetchAPI(endpoint: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Create MCP server
const server = new McpServer({
  name: 'codeflow',
  version: '1.0.0',
});

// Tool: Search functions by name
server.registerTool(
  'search_functions',
  {
    title: 'Search Functions',
    description: 'Search for functions, classes, or methods by name pattern',
    inputSchema: z.object({
      query: z.string().describe('Search pattern (partial name match)'),
    }),
  },
  async ({ query }) => {
    const data = await fetchAPI(`/api/search?q=${encodeURIComponent(query)}`) as {
      nodes: Array<{ id: string; name: string; kind: string; filePath: string; signature: string }>;
      count: number;
    };

    const results = data.nodes.map(n =>
      `${n.kind}: ${n.name} - ${n.filePath}\n  Signature: ${n.signature}`
    ).join('\n\n');

    return {
      content: [{ type: 'text', text: results || 'No results found' }],
    };
  }
);

// Tool: Get callers of a function
server.registerTool(
  'get_callers',
  {
    title: 'Get Callers',
    description: 'Find all functions that call a given function',
    inputSchema: z.object({
      name: z.string().describe('Function name to find callers for'),
    }),
  },
  async ({ name }) => {
    // First search for the function to get its ID
    const search = await fetchAPI(`/api/search?q=${encodeURIComponent(name)}`) as {
      nodes: Array<{ id: string; name: string }>;
    };

    if (search.nodes.length === 0) {
      return { content: [{ type: 'text', text: `Function "${name}" not found` }] };
    }

    const nodeId = search.nodes[0].id;
    const data = await fetchAPI(`/api/nodes/${encodeURIComponent(nodeId)}/callers`) as {
      callers: Array<{ id: string; name: string; filePath: string }>;
      count: number;
    };

    if (data.count === 0) {
      return { content: [{ type: 'text', text: `No callers found for "${name}"` }] };
    }

    const results = data.callers.map(c => `- ${c.name} (${c.filePath})`).join('\n');
    return {
      content: [{ type: 'text', text: `Functions that call "${name}":\n${results}` }],
    };
  }
);

// Tool: Get callees of a function
server.registerTool(
  'get_callees',
  {
    title: 'Get Callees',
    description: 'Find all functions that a given function calls',
    inputSchema: z.object({
      name: z.string().describe('Function name to find callees for'),
    }),
  },
  async ({ name }) => {
    const search = await fetchAPI(`/api/search?q=${encodeURIComponent(name)}`) as {
      nodes: Array<{ id: string; name: string }>;
    };

    if (search.nodes.length === 0) {
      return { content: [{ type: 'text', text: `Function "${name}" not found` }] };
    }

    const nodeId = search.nodes[0].id;
    const data = await fetchAPI(`/api/nodes/${encodeURIComponent(nodeId)}/callees`) as {
      callees: Array<{ id: string; name: string; filePath: string }>;
      count: number;
    };

    if (data.count === 0) {
      return { content: [{ type: 'text', text: `"${name}" doesn't call any tracked functions` }] };
    }

    const results = data.callees.map(c => `- ${c.name} (${c.filePath})`).join('\n');
    return {
      content: [{ type: 'text', text: `Functions called by "${name}":\n${results}` }],
    };
  }
);

// Tool: Get call chain from a function
server.registerTool(
  'get_call_chain',
  {
    title: 'Get Call Chain',
    description: 'Get the full call chain starting from a function (what it calls, what those call, etc.)',
    inputSchema: z.object({
      name: z.string().describe('Function name to start from'),
      depth: z.number().optional().default(3).describe('How deep to traverse (default: 3)'),
    }),
  },
  async ({ name, depth }) => {
    const search = await fetchAPI(`/api/search?q=${encodeURIComponent(name)}`) as {
      nodes: Array<{ id: string; name: string }>;
    };

    if (search.nodes.length === 0) {
      return { content: [{ type: 'text', text: `Function "${name}" not found` }] };
    }

    const nodeId = search.nodes[0].id;
    const data = await fetchAPI(`/api/nodes/${encodeURIComponent(nodeId)}/chain?depth=${depth}`) as {
      root: string;  // Node ID
      chain: Array<{ caller: string; callee: string; callSite: { line: number; col: number } }>;
      depth: number;
    };

    if (data.chain.length === 0) {
      return { content: [{ type: 'text', text: `"${name}" doesn't call any tracked functions` }] };
    }

    // Get node names for display
    const nodeIds = new Set<string>([data.root]);
    for (const edge of data.chain) {
      nodeIds.add(edge.caller);
      nodeIds.add(edge.callee);
    }

    // Fetch node details
    const graph = await fetchAPI('/api/graph') as {
      nodes: Array<{ id: string; name: string; filePath: string }>;
    };
    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

    // Build a tree representation
    const rootNode = nodeMap.get(data.root);
    const lines: string[] = [`Call chain from "${rootNode?.name || name}":`];

    // Group by depth level
    const byLevel = new Map<string, string[]>();
    for (const edge of data.chain) {
      const callee = nodeMap.get(edge.callee);
      if (callee) {
        const existing = byLevel.get(edge.caller) || [];
        existing.push(`${callee.name} (line ${edge.callSite.line})`);
        byLevel.set(edge.caller, existing);
      }
    }

    // Print tree
    function printCalls(nodeId: string, indent: number, visited: Set<string>) {
      const calls = byLevel.get(nodeId);
      if (!calls || visited.has(nodeId)) return;
      visited.add(nodeId);

      for (const call of calls) {
        const calleeId = data.chain.find(e => e.caller === nodeId && nodeMap.get(e.callee)?.name === call.split(' (line')[0])?.callee;
        lines.push('  '.repeat(indent) + `-> ${call}`);
        if (calleeId) {
          printCalls(calleeId, indent + 1, visited);
        }
      }
    }

    printCalls(data.root, 1, new Set());

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }
);

// Tool: Get functions in a file
server.registerTool(
  'get_file_functions',
  {
    title: 'Get File Functions',
    description: 'List all functions in a specific file',
    inputSchema: z.object({
      path: z.string().describe('File path (can be partial, e.g., "auth.ts")'),
    }),
  },
  async ({ path }) => {
    const data = await fetchAPI('/api/graph') as {
      nodes: Array<{ id: string; name: string; kind: string; filePath: string; signature: string }>;
    };

    const matches = data.nodes.filter(n =>
      n.filePath.includes(path) && (n.kind === 'function' || n.kind === 'method')
    );

    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No functions found in files matching "${path}"` }] };
    }

    const byFile = new Map<string, typeof matches>();
    for (const m of matches) {
      const existing = byFile.get(m.filePath) || [];
      existing.push(m);
      byFile.set(m.filePath, existing);
    }

    const lines: string[] = [];
    for (const [file, funcs] of byFile) {
      lines.push(`\n${file}:`);
      for (const f of funcs) {
        lines.push(`  - ${f.name}${f.signature}`);
      }
    }

    return {
      content: [{ type: 'text', text: lines.join('\n').trim() }],
    };
  }
);

// Tool: Get touched functions (recently edited, need annotation)
server.registerTool(
  'get_touched_functions',
  {
    title: 'Get Touched Functions',
    description: 'Get functions that were recently edited and may need annotation',
    inputSchema: z.object({
      limit: z.number().optional().default(20).describe('Max functions to return'),
    }),
  },
  async ({ limit }) => {
    const data = await fetchAPI(`/api/functions/touched?limit=${limit}`) as {
      touched: Array<{ name: string; filePath: string; hasAnnotation: boolean }>;
      count: number;
    };

    if (data.count === 0) {
      return { content: [{ type: 'text', text: 'No recently touched functions' }] };
    }

    const lines = data.touched.map(t =>
      `- ${t.name} (${t.filePath}) ${t.hasAnnotation ? '[has annotation]' : '[needs annotation]'}`
    );

    return {
      content: [{ type: 'text', text: `Recently touched functions:\n${lines.join('\n')}` }],
    };
  }
);

// Tool: Get graph stats
server.registerTool(
  'get_stats',
  {
    title: 'Get Stats',
    description: 'Get statistics about the analyzed codebase',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await fetchAPI('/api/stats') as {
      graph: {
        nodeCount: number;
        edgeCount: number;
        fileCount: number;
        functionCount: number;
        classCount: number;
      };
    };

    return {
      content: [{
        type: 'text',
        text: `Codebase stats:\n- Files: ${data.graph.fileCount}\n- Functions: ${data.graph.functionCount}\n- Classes: ${data.graph.classCount}\n- Total nodes: ${data.graph.nodeCount}\n- Call edges: ${data.graph.edgeCount}`
      }],
    };
  }
);

// Tool: Evaluate observability rules
server.registerTool(
  'evaluate_rules',
  {
    title: 'Evaluate Rules',
    description: 'Evaluate observability rules and return any violations (missing annotations, stale docs, drift, concept shifts)',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await fetchAPI('/api/rules/evaluate', { method: 'POST' }) as {
      evaluatedAt: number;
      violationCount: number;
      violations: Array<{
        ruleName: string;
        condition: string;
        targets: Array<{ name: string; reason: string }>;
      }>;
    };

    if (data.violationCount === 0) {
      return {
        content: [{
          type: 'text',
          text: '✓ No rule violations. All observability checks pass.'
        }],
      };
    }

    const lines = [`⚠️ ${data.violationCount} rule violation(s):\n`];
    for (const v of data.violations) {
      lines.push(`**${v.ruleName}** (${v.condition}): ${v.targets.length} issue(s)`);
      for (const t of v.targets.slice(0, 3)) {
        lines.push(`  - ${t.name}: ${t.reason}`);
      }
      if (v.targets.length > 3) {
        lines.push(`  ... and ${v.targets.length - 3} more`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }],
    };
  }
);

// Tool: Get concept map (semantic domains)
server.registerTool(
  'get_concept_map',
  {
    title: 'Get Concept Map',
    description: 'Get all concept domains and their members - the semantic landscape of the codebase',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await fetchAPI('/api/concepts/domains') as {
      domains: Array<{
        id: string;
        name: string;
        description?: string;
        memberCount: number;
      }>;
    };

    if (data.domains.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No concept domains defined yet. Use /api/concepts/domains to create domains or run clustering.'
        }],
      };
    }

    const lines = ['Concept Map:\n'];
    for (const d of data.domains) {
      lines.push(`**${d.name}** (${d.memberCount} functions)`);
      if (d.description) {
        lines.push(`  ${d.description}`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }],
    };
  }
);

// Tool: Query concepts (semantic search)
server.registerTool(
  'query_concepts',
  {
    title: 'Query Concepts',
    description: 'Search for functions semantically similar to a natural language query',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of what you\'re looking for'),
    }),
  },
  async ({ query }) => {
    const data = await fetchAPI(`/api/concepts/search?q=${encodeURIComponent(query)}`) as {
      results: Array<{
        name: string;
        filePath: string;
        annotation: string;
        similarity: number;
      }>;
    };

    if (data.results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No functions found matching "${query}". Try a different query or ensure functions are annotated.`
        }],
      };
    }

    const lines = [`Functions matching "${query}":\n`];
    for (const r of data.results.slice(0, 10)) {
      lines.push(`**${r.name}** (${(r.similarity * 100).toFixed(0)}% match)`);
      lines.push(`  ${r.filePath}`);
      lines.push(`  ${r.annotation}`);
      lines.push('');
    }

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }],
    };
  }
);

// Tool: Get concept shifts (purpose changes)
server.registerTool(
  'get_concept_shifts',
  {
    title: 'Get Concept Shifts',
    description: 'Get recent concept shifts - when functions\' purposes changed',
    inputSchema: z.object({}),
  },
  async () => {
    const data = await fetchAPI('/api/concepts/shifts') as {
      shifts: Array<{
        nodeId: string;
        fromDomain?: string;
        toDomain?: string;
        shiftReason?: string;
        detectedAt: number;
        reviewed: boolean;
      }>;
    };

    if (data.shifts.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No concept shifts detected. Purpose changes will appear here when annotations change significantly.'
        }],
      };
    }

    const lines = ['Recent Concept Shifts:\n'];
    for (const s of data.shifts.slice(0, 10)) {
      const from = s.fromDomain || '(new)';
      const to = s.toDomain || '(unknown)';
      const status = s.reviewed ? '[Reviewed]' : '[Needs Review]';
      lines.push(`${status} ${s.nodeId.split(':').pop()}: ${from} → ${to}`);
      if (s.shiftReason) {
        lines.push(`  Reason: ${s.shiftReason}`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: lines.join('\n')
      }],
    };
  }
);

// Tool: Get semantic snapshot (unified view)
server.registerTool(
  'get_semantic_snapshot',
  {
    title: 'Get Semantic Snapshot',
    description: 'Get unified view of codebase: concepts, violations, hotspots. Use this to understand the codebase at a high level.',
    inputSchema: z.object({}),
  },
  async () => {
    const snapshot = await fetchAPI('/api/snapshot') as {
      generatedAt: number;
      project: string;
      domains: Array<{
        name: string;
        description?: string;
        memberCount: number;
        topMembers: string[];
      }>;
      unreviewedShifts: Array<{
        functionName: string;
        filePath: string;
        similarity: number;
        reason?: string;
      }>;
      violations: Array<{
        rule: string;
        ruleName: string;
        count: number;
        examples: string[];
      }>;
      hotspots: Array<{
        functionName: string;
        filePath: string;
        callerCount: number;
      }>;
      stats: {
        totalFunctions: number;
        annotatedCount: number;
        domainCount: number;
        violationCount: number;
        shiftCount: number;
      };
    };

    // Format for Claude consumption
    let output = `# Semantic Snapshot (${new Date(snapshot.generatedAt).toLocaleTimeString()})\n\n`;

    output += `## Stats\n`;
    output += `- ${snapshot.stats.totalFunctions} functions (${snapshot.stats.annotatedCount} annotated)\n`;
    output += `- ${snapshot.stats.domainCount} concept domains\n`;
    output += `- ${snapshot.stats.violationCount} invariant violations\n`;
    output += `- ${snapshot.stats.shiftCount} unreviewed shifts\n\n`;

    if (snapshot.domains.length > 0) {
      output += `## Concept Domains\n`;
      for (const d of snapshot.domains) {
        output += `- **${d.name}** (${d.memberCount} fn): ${d.topMembers.join(', ') || 'no members'}\n`;
      }
      output += '\n';
    }

    if (snapshot.unreviewedShifts.length > 0) {
      output += `## Needs Review (concept shifted)\n`;
      for (const s of snapshot.unreviewedShifts) {
        output += `- ${s.functionName} (${(s.similarity * 100).toFixed(0)}% similar): ${s.reason || 'purpose changed'}\n`;
      }
      output += '\n';
    }

    if (snapshot.violations.length > 0) {
      output += `## Violations\n`;
      for (const v of snapshot.violations) {
        output += `- **${v.ruleName}** (${v.count}): ${v.examples.join(', ')}\n`;
      }
      output += '\n';
    }

    if (snapshot.hotspots.length > 0) {
      output += `## Hotspots (high impact)\n`;
      for (const h of snapshot.hotspots) {
        output += `- ${h.functionName} — ${h.callerCount} callers\n`;
      }
    }

    return { content: [{ type: 'text', text: output }] };
  }
);

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CodeFlow MCP server running');
}

main().catch(console.error);
