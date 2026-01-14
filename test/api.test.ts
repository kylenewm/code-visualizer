/**
 * API Endpoint Tests
 *
 * Tests the REST API endpoints against the e2e fixture.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ApiServer } from '../src/server/express.js';
import { AnalysisPipeline } from '../src/analyzer/pipeline.js';
import * as path from 'path';

describe('API Endpoints', () => {
  let server: ApiServer;
  let pipeline: AnalysisPipeline;
  let baseUrl: string;
  const testPort = 3099; // Use different port to avoid conflicts

  beforeAll(async () => {
    // Analyze fixture
    pipeline = new AnalysisPipeline();
    const testFile = path.join(__dirname, 'fixtures/e2e-project/app.ts');
    await pipeline.analyzeFile(testFile);

    // Start server
    server = new ApiServer({ port: testPort });
    server.setGraph(pipeline.getGraph());
    await server.start();
    baseUrl = `http://localhost:${testPort}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await request(baseUrl).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/stats', () => {
    it('returns graph statistics', async () => {
      const res = await request(baseUrl).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body.graph).toBeDefined();
      expect(res.body.graph.nodeCount).toBeGreaterThan(0);
      expect(res.body.graph.edgeCount).toBeGreaterThan(0);
    });
  });

  describe('GET /api/graph', () => {
    it('returns full graph', async () => {
      const res = await request(baseUrl).get('/api/graph');

      expect(res.status).toBe(200);
      expect(res.body.nodes).toBeDefined();
      expect(res.body.edges).toBeDefined();
      expect(res.body.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/search', () => {
    it('finds nodes by name', async () => {
      const res = await request(baseUrl).get('/api/search?q=handleRequest');

      expect(res.status).toBe(200);
      expect(res.body.nodes).toBeDefined();
      expect(res.body.count).toBeGreaterThan(0);
      expect(res.body.nodes[0].name).toBe('handleRequest');
    });

    it('finds nodes by partial name', async () => {
      const res = await request(baseUrl).get('/api/search?q=Data');

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(0);

      const names = res.body.nodes.map((n: { name: string }) => n.name);
      expect(names).toContain('processData');
    });

    it('returns 400 without query param', async () => {
      const res = await request(baseUrl).get('/api/search');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/nodes/:id', () => {
    it('returns node by ID', async () => {
      // First get a node ID from search
      const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
      const nodeId = searchRes.body.nodes[0].id;

      const res = await request(baseUrl).get(`/api/nodes/${encodeURIComponent(nodeId)}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('handleRequest');
      expect(res.body.kind).toBe('function');
    });

    it('returns 404 for unknown node', async () => {
      const res = await request(baseUrl).get('/api/nodes/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/nodes/:id/callers', () => {
    it('returns callers of a node', async () => {
      // Get processData node
      const searchRes = await request(baseUrl).get('/api/search?q=processData');
      const nodeId = searchRes.body.nodes[0].id;

      const res = await request(baseUrl).get(`/api/nodes/${encodeURIComponent(nodeId)}/callers`);

      expect(res.status).toBe(200);
      expect(res.body.callers).toBeDefined();

      const callerNames = res.body.callers.map((n: { name: string }) => n.name);
      expect(callerNames).toContain('handleRequest');
    });
  });

  describe('GET /api/nodes/:id/callees', () => {
    it('returns callees of a node', async () => {
      // Get handleRequest node
      const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
      const nodeId = searchRes.body.nodes[0].id;

      const res = await request(baseUrl).get(`/api/nodes/${encodeURIComponent(nodeId)}/callees`);

      expect(res.status).toBe(200);
      expect(res.body.callees).toBeDefined();

      const calleeNames = res.body.callees.map((n: { name: string }) => n.name);
      expect(calleeNames).toContain('validateInput');
      expect(calleeNames).toContain('processData');
      expect(calleeNames).toContain('formatResponse');
    });
  });

  describe('GET /api/nodes/:id/chain', () => {
    it('returns call chain from node', async () => {
      // Get handleRequest node
      const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
      const nodeId = searchRes.body.nodes[0].id;

      const res = await request(baseUrl).get(`/api/nodes/${encodeURIComponent(nodeId)}/chain?depth=3`);

      expect(res.status).toBe(200);
      expect(res.body.root).toBe(nodeId);
      expect(res.body.chain).toBeDefined();
      expect(res.body.depth).toBe(3);
    });
  });

  describe('GET /api/nodes/:id/neighborhood', () => {
    it('returns neighborhood subgraph', async () => {
      // Get processData node
      const searchRes = await request(baseUrl).get('/api/search?q=processData');
      const nodeId = searchRes.body.nodes[0].id;

      const res = await request(baseUrl).get(`/api/nodes/${encodeURIComponent(nodeId)}/neighborhood?hops=1`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toBeDefined();
      expect(res.body.edges).toBeDefined();

      const nodeNames = res.body.nodes.map((n: { name: string }) => n.name);
      expect(nodeNames).toContain('processData');
      expect(nodeNames).toContain('transformData'); // callee
      expect(nodeNames).toContain('saveToDb'); // callee
    });
  });

  describe('GET /api/files', () => {
    it('lists all analyzed files', async () => {
      const res = await request(baseUrl).get('/api/files');

      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
      expect(res.body.count).toBeGreaterThan(0);
    });
  });

  describe('Annotation Endpoints', () => {
    describe('GET /api/annotations/pending', () => {
      it('returns unannotated functions', async () => {
        const res = await request(baseUrl).get('/api/annotations/pending');

        expect(res.status).toBe(200);
        expect(res.body.nodes).toBeDefined();
        expect(res.body.count).toBeGreaterThan(0);
        expect(res.body.unannotated).toBeDefined();
        expect(res.body.stale).toBeDefined();
      });

      it('respects limit parameter', async () => {
        const res = await request(baseUrl).get('/api/annotations/pending?limit=2');

        expect(res.status).toBe(200);
        expect(res.body.nodes.length).toBeLessThanOrEqual(2);
      });
    });

    describe('POST /api/nodes/:id/annotation', () => {
      it('updates node annotation', async () => {
        // Get a function node
        const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
        const nodeId = searchRes.body.nodes[0].id;

        const res = await request(baseUrl)
          .post(`/api/nodes/${encodeURIComponent(nodeId)}/annotation`)
          .send({ text: 'Handles incoming requests and orchestrates processing.', source: 'claude' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.node.annotation).toBeDefined();
        expect(res.body.node.annotation.text).toBe('Handles incoming requests and orchestrates processing.');
        expect(res.body.node.annotation.source).toBe('claude');
        expect(res.body.node.annotation.contentHash).toBeDefined();
        expect(res.body.node.annotation.generatedAt).toBeDefined();
      });

      it('returns 400 without text', async () => {
        const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
        const nodeId = searchRes.body.nodes[0].id;

        const res = await request(baseUrl)
          .post(`/api/nodes/${encodeURIComponent(nodeId)}/annotation`)
          .send({});

        expect(res.status).toBe(400);
      });

      it('returns 404 for unknown node', async () => {
        const res = await request(baseUrl)
          .post('/api/nodes/nonexistent/annotation')
          .send({ text: 'Test' });

        expect(res.status).toBe(404);
      });
    });

    describe('POST /api/annotations/bulk', () => {
      it('updates multiple annotations', async () => {
        // Get two function nodes
        const search1 = await request(baseUrl).get('/api/search?q=validateInput');
        const search2 = await request(baseUrl).get('/api/search?q=processData');
        const nodeId1 = search1.body.nodes[0].id;
        const nodeId2 = search2.body.nodes[0].id;

        const res = await request(baseUrl)
          .post('/api/annotations/bulk')
          .send({
            annotations: [
              { nodeId: nodeId1, text: 'Validates incoming request data.' },
              { nodeId: nodeId2, text: 'Processes and transforms data.' },
            ],
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(2);
        expect(res.body.failed).toBe(0);
        expect(res.body.results.length).toBe(2);
      });

      it('handles partial failures', async () => {
        const searchRes = await request(baseUrl).get('/api/search?q=handleRequest');
        const validNodeId = searchRes.body.nodes[0].id;

        const res = await request(baseUrl)
          .post('/api/annotations/bulk')
          .send({
            annotations: [
              { nodeId: validNodeId, text: 'Valid annotation.' },
              { nodeId: 'nonexistent', text: 'Invalid.' },
            ],
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(1);
        expect(res.body.failed).toBe(1);
      });

      it('returns 400 without annotations array', async () => {
        const res = await request(baseUrl)
          .post('/api/annotations/bulk')
          .send({});

        expect(res.status).toBe(400);
      });
    });
  });
});
