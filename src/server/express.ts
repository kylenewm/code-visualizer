/**
 * Express REST API Server
 * Provides endpoints for graph data, analysis, and real-time updates
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CodeGraph } from '../graph/graph.js';
import type { ChangeDetector, ChangeDetectorStats, ChangeEvent } from '../hooks/index.js';
import type { AnalysisResult } from '../hooks/change-aggregator.js';

// ============================================
// Types
// ============================================

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

export interface WebSocketMessage {
  type: 'graph:update' | 'analysis:start' | 'analysis:complete' | 'change' | 'change:recorded' | 'stats' | 'pong';
  payload: unknown;
}

// ============================================
// API Server
// ============================================

export class ApiServer {
  private app: Express;
  private server: HttpServer;
  private wss: WebSocketServer;
  private config: ServerConfig;
  private graph: CodeGraph | null = null;
  private detector: ChangeDetector | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = {
      port: 3001,
      host: 'localhost',
      corsOrigins: ['http://localhost:5173', 'http://localhost:3000'],
      ...config,
    };

    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // ----------------------------------------
  // Helpers
  // ----------------------------------------

  private getParamAsString(param: string | string[]): string {
    return Array.isArray(param) ? param[0] : param;
  }

  private getQueryAsInt(query: unknown, defaultValue: number): number {
    if (query === undefined || query === null) return defaultValue;
    if (Array.isArray(query)) {
      return parseInt(String(query[0])) || defaultValue;
    }
    return parseInt(String(query)) || defaultValue;
  }

  // ----------------------------------------
  // Middleware
  // ----------------------------------------

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: this.config.corsOrigins,
    }));
    this.app.use(express.json());
  }

  // ----------------------------------------
  // Routes
  // ----------------------------------------

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get graph stats
    this.app.get('/api/stats', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const graphStats = this.graph.getStats();
      const detectorStats = this.detector?.getStats();

      res.json({
        graph: graphStats,
        detector: detectorStats,
      });
    });

    // Get full graph
    this.app.get('/api/graph', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      res.json(this.graph.toJSON());
    });

    // Search nodes
    this.app.get('/api/search', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const pattern = req.query.q as string;
      if (!pattern) {
        return res.status(400).json({ error: 'Missing query parameter: q' });
      }

      const nodes = this.graph.searchNodes(pattern);
      res.json({ nodes, count: nodes.length });
    });

    // Get node by ID
    this.app.get('/api/nodes/:id', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const node = this.graph.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      res.json(node);
    });

    // Get node callers
    this.app.get('/api/nodes/:id/callers', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const callers = this.graph.findCallers(nodeId);
      res.json({ callers, count: callers.length });
    });

    // Get node callees
    this.app.get('/api/nodes/:id/callees', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const callees = this.graph.findCallees(nodeId);
      res.json({ callees, count: callees.length });
    });

    // Get call chain from node
    this.app.get('/api/nodes/:id/chain', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const depth = this.getQueryAsInt(req.query.depth, 5);
      const chain = this.graph.getCallChain(nodeId, depth);
      res.json(chain);
    });

    // Get reverse call chain (callers up the stack)
    this.app.get('/api/nodes/:id/reverse-chain', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const depth = this.getQueryAsInt(req.query.depth, 5);
      const chain = this.graph.getReverseCallChain(nodeId, depth);
      res.json(chain);
    });

    // Get neighborhood subgraph
    this.app.get('/api/nodes/:id/neighborhood', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const hops = this.getQueryAsInt(req.query.hops, 2);
      const neighborhood = this.graph.getNeighborhood(nodeId, hops);
      res.json(neighborhood);
    });

    // Get file nodes
    this.app.get('/api/files/:path(*)', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const pathParam = this.getParamAsString(req.params.path);
      const filePath = '/' + pathParam;
      const nodes = this.graph.getFileNodes(filePath);
      const deps = this.graph.getModuleDeps(filePath);

      res.json({ nodes, dependencies: deps });
    });

    // List all files
    this.app.get('/api/files', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const files = this.graph.getFilePaths();
      res.json({ files, count: files.length });
    });

    // Get module graph (architecture view)
    this.app.get('/api/modules', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const moduleGraph = this.graph.getModuleGraph();
      res.json(moduleGraph);
    });

    // Get change history with diffs
    this.app.get('/api/changes', (req: Request, res: Response) => {
      if (!this.detector) {
        return res.status(503).json({ error: 'Change detector not initialized' });
      }

      const limit = this.getQueryAsInt(req.query.limit, 50);
      const changes = this.detector.getChangeHistory(limit);
      res.json({ changes, count: changes.length });
    });

    // Get a specific change event by ID
    this.app.get('/api/changes/:id', (req: Request, res: Response) => {
      if (!this.detector) {
        return res.status(503).json({ error: 'Change detector not initialized' });
      }

      const changeId = this.getParamAsString(req.params.id);
      const change = this.detector.getChangeEvent(changeId);

      if (!change) {
        return res.status(404).json({ error: 'Change not found' });
      }

      res.json(change);
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('API Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  // ----------------------------------------
  // WebSocket
  // ----------------------------------------

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      // Send initial graph on connect
      if (this.graph) {
        this.sendToClient(ws, {
          type: 'graph:update',
          payload: this.graph.toJSON(),
        });
      }

      // Handle incoming messages (ping/pong)
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'ping') {
            this.sendToClient(ws, { type: 'pong', payload: null });
          }
        } catch {
          // Ignore parse errors
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: WebSocketMessage): void {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  // ----------------------------------------
  // Integration
  // ----------------------------------------

  setGraph(graph: CodeGraph): void {
    this.graph = graph;

    // Broadcast initial graph to connected clients
    this.broadcast({
      type: 'graph:update',
      payload: graph.toJSON(),
    });
  }

  setChangeDetector(detector: ChangeDetector): void {
    this.detector = detector;

    // Wire up events to broadcast
    detector.on('change', (event) => {
      this.broadcast({ type: 'change', payload: event });
    });

    detector.on('change:recorded', (event: ChangeEvent) => {
      this.broadcast({ type: 'change:recorded', payload: event });
    });

    detector.on('analysis:start', (info) => {
      this.broadcast({ type: 'analysis:start', payload: info });
    });

    detector.on('analysis:complete', (result: AnalysisResult) => {
      this.broadcast({ type: 'analysis:complete', payload: result });

      // Send updated graph
      if (this.graph) {
        this.broadcast({
          type: 'graph:update',
          payload: this.graph.toJSON(),
        });
      }
    });
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`API server running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getPort(): number {
    return this.config.port;
  }
}
