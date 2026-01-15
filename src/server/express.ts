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
import { getAnnotationStore } from '../storage/annotation-store.js';
import { getModuleStore } from '../storage/module-store.js';
import { getDriftStore } from '../storage/drift-store.js';
import { getTouchedStore } from '../storage/touched-store.js';
import { getDriftDetector } from '../analyzer/drift-detector.js';
import { getModuleSummarizer } from '../analyzer/module-summarizer.js';
import { getConceptShiftDetector } from '../analyzer/concept-shift.js';
import { getDatabase } from '../storage/sqlite.js';
import { getRuleStore } from '../storage/rule-store.js';
import { getRuleEvaluator } from '../analyzer/rule-evaluator.js';
import { getConceptLayer } from '../analyzer/concept-layer.js';
import { getSnapshotGenerator } from '../analyzer/semantic-snapshot.js';

/**
 * Check if the database is initialized
 */
function isDatabaseInitialized(): boolean {
  try {
    return getDatabase().isInitialized();
  } catch {
    return false;
  }
}

// ============================================
// Types
// ============================================

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  projectPath?: string;
}

export interface WebSocketMessage {
  type: 'graph:update' | 'analysis:start' | 'analysis:complete' | 'change' | 'change:recorded' | 'drift:detected' | 'rules:violation' | 'stats' | 'pong';
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
      corsOrigins: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
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

    // Get semantic snapshot
    this.app.get('/api/snapshot', (_req: Request, res: Response) => {
      const snapshotGenerator = getSnapshotGenerator();
      const snapshot = snapshotGenerator.generate(this.config.projectPath || 'unknown');
      res.json(snapshot);
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

    // ----------------------------------------
    // Annotation Endpoints (with persistence)
    // ----------------------------------------

    // Get annotation statistics
    this.app.get('/api/annotations/stats', (_req: Request, res: Response) => {
      const annotationStore = getAnnotationStore();
      const stats = annotationStore.getStats();
      res.json(stats);
    });

    // Get nodes needing annotation (unannotated or stale)
    this.app.get('/api/annotations/pending', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const limit = this.getQueryAsInt(req.query.limit, 50);
      const allNodes = this.graph.getAllNodes();

      const pending = allNodes.filter(n => {
        // Only functions and methods can have annotations
        if (n.kind !== 'function' && n.kind !== 'method') return false;
        // No annotation yet
        if (!n.annotation) return true;
        // Stale annotation (content changed since annotation)
        if (n.contentHash && n.annotation.contentHash !== n.contentHash) return true;
        return false;
      }).slice(0, limit);

      const staleCount = pending.filter(n => n.annotation).length;
      const unannotatedCount = pending.filter(n => !n.annotation).length;

      res.json({
        nodes: pending,
        count: pending.length,
        stale: staleCount,
        unannotated: unannotatedCount,
      });
    });

    // Get annotation history for a node (uses stableId for lookup)
    this.app.get('/api/nodes/:id/annotation/history', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const node = this.graph.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      const annotationStore = getAnnotationStore();
      const history = annotationStore.getHistory(node.stableId);
      res.json({ nodeId, stableId: node.stableId, history, count: history.length });
    });

    // Update annotation for a single node (with persistence)
    this.app.post('/api/nodes/:id/annotation', async (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const node = this.graph.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      const { text, source } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Annotation text required' });
      }

      const annotationSource: 'claude' | 'manual' = source === 'manual' ? 'manual' : 'claude';
      const contentHash = node.contentHash || '';

      let versionId: number | undefined;
      let isNew = true;
      let supersededId: number | undefined;
      let conceptShiftDetected = false;

      // Persist to database if initialized
      if (isDatabaseInitialized()) {
        try {
          const annotationStore = getAnnotationStore();

          // Get old annotation before saving new one (for concept shift detection)
          const oldAnnotation = annotationStore.getCurrent(node.stableId);

          const result = annotationStore.saveAnnotation(nodeId, node.stableId, text, contentHash, annotationSource);
          versionId = result.versionId;
          isNew = result.isNew;
          supersededId = result.supersededId;

          // Detect concept shift if there was a previous annotation
          if (oldAnnotation && oldAnnotation.text !== text) {
            try {
              const conceptShiftDetector = getConceptShiftDetector();
              const shiftResult = await conceptShiftDetector.semanticPreCheck(oldAnnotation.text, text);

              if (shiftResult.result === 'SHIFTED' || (shiftResult.result === 'UNCLEAR' && shiftResult.similarity < 0.6)) {
                // Record the concept shift
                const conceptLayer = getConceptLayer();
                conceptLayer.recordConceptShift(
                  nodeId,
                  node.stableId,
                  null, // fromDomainId - would need to look up
                  null, // toDomainId
                  shiftResult.reason || `Semantic similarity: ${(shiftResult.similarity * 100).toFixed(0)}%`,
                  shiftResult.similarity
                );
                conceptShiftDetected = true;
                console.log(`Concept shift detected for ${node.name}: ${shiftResult.reason}`);
              }
            } catch (shiftError) {
              console.warn('Failed to detect concept shift:', shiftError);
            }
          }

          // Resolve any drift for this node (by stableId)
          const driftDetector = getDriftDetector();
          driftDetector.resolveOnAnnotation(node.stableId);

          // Clear from touched queue
          const touchedStore = getTouchedStore();
          touchedStore.markAnnotated(node.stableId);
        } catch (error) {
          // Log but don't fail - in-memory update still works
          console.warn('Failed to persist annotation:', error);
        }
      }

      // Update node with annotation
      node.annotation = {
        text,
        contentHash,
        generatedAt: Date.now(),
        source: annotationSource,
      };

      // Broadcast update
      this.broadcast({
        type: 'graph:update',
        payload: this.graph.toJSON(),
      });

      res.json({
        success: true,
        versionId,
        isNew,
        supersededId,
        conceptShiftDetected,
        node,
      });
    });

    // Bulk update annotations (with persistence)
    this.app.post('/api/annotations/bulk', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const { annotations } = req.body;
      if (!Array.isArray(annotations)) {
        return res.status(400).json({ error: 'Annotations array required' });
      }

      const dbInitialized = isDatabaseInitialized();

      const results = annotations.map(({ nodeId, text, source }: { nodeId: string; text: string; source?: string }) => {
        const node = this.graph!.getNode(nodeId);
        if (!node) return { nodeId, success: false, error: 'Not found' };

        const annotationSource: 'claude' | 'manual' = source === 'manual' ? 'manual' : 'claude';
        const contentHash = node.contentHash || '';

        let versionId: number | undefined;

        // Persist to database if initialized
        if (dbInitialized) {
          try {
            const annotationStore = getAnnotationStore();
            const saveResult = annotationStore.saveAnnotation(nodeId, node.stableId, text, contentHash, annotationSource);
            versionId = saveResult.versionId;

            // Resolve drift (by stableId)
            const driftDetector = getDriftDetector();
            driftDetector.resolveOnAnnotation(node.stableId);

            // Clear from touched queue
            const touchedStore = getTouchedStore();
            touchedStore.markAnnotated(node.stableId);
          } catch (error) {
            console.warn('Failed to persist annotation:', error);
          }
        }

        // Update in-memory node
        node.annotation = {
          text,
          contentHash,
          generatedAt: Date.now(),
          source: annotationSource,
        };

        return { nodeId, success: true, versionId };
      });

      // Broadcast update
      this.broadcast({
        type: 'graph:update',
        payload: this.graph.toJSON(),
      });

      const successCount = results.filter(r => r.success).length;
      res.json({ results, success: successCount, failed: results.length - successCount });
    });

    // ----------------------------------------
    // Module Annotation Endpoints
    // ----------------------------------------

    // Get module annotation
    this.app.get('/api/modules/:path(*)/annotation', (req: Request, res: Response) => {
      const modulePath = '/' + this.getParamAsString(req.params.path);
      const moduleStore = getModuleStore();
      const annotation = moduleStore.getAnnotation(modulePath);

      if (!annotation) {
        return res.status(404).json({ error: 'No annotation for this module' });
      }

      // Check staleness if graph available
      if (this.graph) {
        const summarizer = getModuleSummarizer();
        summarizer.setGraph(this.graph);
        const extended = summarizer.getExtendedModuleNode(modulePath);
        if (extended?.annotation) {
          return res.json({
            ...annotation,
            stale: extended.annotation.stale,
            functionsCovered: extended.annotation.functionsCovered,
            functionsTotal: extended.annotation.functionsTotal,
          });
        }
      }

      res.json(annotation);
    });

    // Generate/regenerate module annotation
    this.app.post('/api/modules/:path(*)/annotation/regenerate', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const modulePath = '/' + this.getParamAsString(req.params.path);
      const summarizer = getModuleSummarizer();
      summarizer.setGraph(this.graph);

      const result = summarizer.summarizeModule(modulePath);
      if (!result) {
        return res.status(404).json({ error: 'Module not found or has no functions' });
      }

      res.json(result);
    });

    // Get all modules with annotation status
    this.app.get('/api/modules/annotations', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const summarizer = getModuleSummarizer();
      summarizer.setGraph(this.graph);
      const modules = summarizer.getAllExtendedModules();
      res.json({ modules, count: modules.length });
    });

    // Get stale modules
    this.app.get('/api/modules/annotations/stale', (_req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const summarizer = getModuleSummarizer();
      summarizer.setGraph(this.graph);
      const stale = summarizer.getStaleModules();
      res.json({ stale, count: stale.length });
    });

    // Get module coverage
    this.app.get('/api/modules/:path(*)/coverage', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const modulePath = '/' + this.getParamAsString(req.params.path);
      const summarizer = getModuleSummarizer();
      summarizer.setGraph(this.graph);
      const coverage = summarizer.getModuleCoverage(modulePath);
      res.json(coverage);
    });

    // ----------------------------------------
    // Drift Detection Endpoints
    // ----------------------------------------

    // Get drift statistics
    this.app.get('/api/drift/stats', (_req: Request, res: Response) => {
      const driftDetector = getDriftDetector();
      const stats = driftDetector.getStats();
      res.json(stats);
    });

    // Get all unresolved drift
    this.app.get('/api/drift', (req: Request, res: Response) => {
      const limit = this.getQueryAsInt(req.query.limit, 100);
      const driftDetector = getDriftDetector();
      const drift = driftDetector.getUnresolvedDrift(limit);
      res.json({ drift, count: drift.length });
    });

    // Get drift by severity
    this.app.get('/api/drift/severity/:level', (req: Request, res: Response) => {
      const level = this.getParamAsString(req.params.level) as 'low' | 'medium' | 'high';
      if (!['low', 'medium', 'high'].includes(level)) {
        return res.status(400).json({ error: 'Invalid severity level' });
      }

      const limit = this.getQueryAsInt(req.query.limit, 50);
      const driftStore = getDriftStore();
      const drift = driftStore.getUnresolvedBySeverity(level, limit);
      res.json({ drift, count: drift.length, severity: level });
    });

    // Get drift for a specific node (uses stableId for lookup)
    this.app.get('/api/nodes/:id/drift', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const nodeId = this.getParamAsString(req.params.id);
      const node = this.graph.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      const driftDetector = getDriftDetector();
      const current = driftDetector.getNodeDrift(node.stableId);
      const history = driftDetector.getNodeDriftHistory(node.stableId);

      res.json({
        nodeId,
        stableId: node.stableId,
        hasUnresolvedDrift: current !== null,
        current,
        history,
        historyCount: history.length,
      });
    });

    // Resolve a drift event
    this.app.post('/api/drift/:id/resolve', (req: Request, res: Response) => {
      const driftId = parseInt(this.getParamAsString(req.params.id));
      if (isNaN(driftId)) {
        return res.status(400).json({ error: 'Invalid drift ID' });
      }

      const { resolution } = req.body;
      if (!resolution || typeof resolution !== 'string') {
        return res.status(400).json({ error: 'Resolution text required' });
      }

      const driftDetector = getDriftDetector();
      const success = driftDetector.resolveDrift(driftId, resolution);

      if (!success) {
        return res.status(404).json({ error: 'Drift not found or already resolved' });
      }

      res.json({ success: true, driftId, resolution });
    });

    // Get recent drift events
    this.app.get('/api/drift/recent', (req: Request, res: Response) => {
      const limit = this.getQueryAsInt(req.query.limit, 20);
      const driftStore = getDriftStore();
      const recent = driftStore.getRecent(limit);
      res.json({ drift: recent, count: recent.length });
    });

    // ----------------------------------------
    // Concept Shift Detection Endpoints
    // ----------------------------------------

    // Get all detected concept shifts
    this.app.get('/api/drift/concept-shifts', (req: Request, res: Response) => {
      const limit = this.getQueryAsInt(req.query.limit, 50);
      const conceptShiftDetector = getConceptShiftDetector();
      const shifts = conceptShiftDetector.getConceptShifts(limit);
      const count = conceptShiftDetector.getConceptShiftCount();
      res.json({ shifts, count, total: count });
    });

    // Get pending drift events needing concept check
    this.app.get('/api/drift/concept-pending', (req: Request, res: Response) => {
      const limit = this.getQueryAsInt(req.query.limit, 50);
      const conceptShiftDetector = getConceptShiftDetector();
      const pending = conceptShiftDetector.getPendingChecks(limit);
      res.json({ pending, count: pending.length });
    });

    // Get concept check prompt for a drift event
    this.app.get('/api/drift/:id/concept-check', (req: Request, res: Response) => {
      const driftId = parseInt(this.getParamAsString(req.params.id));
      if (isNaN(driftId)) {
        return res.status(400).json({ error: 'Invalid drift ID' });
      }

      const conceptShiftDetector = getConceptShiftDetector();

      // Check if concept check is needed
      if (!conceptShiftDetector.needsConceptCheck(driftId)) {
        return res.status(400).json({
          error: 'Concept check not needed',
          reason: 'Either already checked, no old annotation exists, or drift not found'
        });
      }

      // Get old annotation
      const oldAnnotation = conceptShiftDetector.getOldAnnotation(driftId);
      if (!oldAnnotation) {
        return res.status(400).json({
          error: 'No old annotation',
          reason: 'Cannot compare without previous annotation'
        });
      }

      // Return prompt info (new annotation text should be provided by caller)
      res.json({
        driftId,
        oldAnnotation,
        promptTemplate: conceptShiftDetector.generatePrompt(oldAnnotation, '{NEW_ANNOTATION}'),
        instructions: 'Replace {NEW_ANNOTATION} with the new annotation text, submit to Claude, then POST result to /api/drift/:id/concept-shift'
      });
    });

    // Record concept shift result
    this.app.post('/api/drift/:id/concept-shift', (req: Request, res: Response) => {
      const driftId = parseInt(this.getParamAsString(req.params.id));
      if (isNaN(driftId)) {
        return res.status(400).json({ error: 'Invalid drift ID' });
      }

      const { result, reason, oldAnnotation, newAnnotation } = req.body;
      if (!result || !['SAME', 'SHIFTED', 'UNCLEAR'].includes(result)) {
        return res.status(400).json({
          error: 'Invalid result',
          validValues: ['SAME', 'SHIFTED', 'UNCLEAR']
        });
      }

      const conceptShiftDetector = getConceptShiftDetector();
      const success = conceptShiftDetector.recordResult(driftId, result, reason);

      if (!success) {
        return res.status(404).json({ error: 'Drift not found' });
      }

      res.json({
        success: true,
        driftId,
        result,
        reason,
        conceptShifted: result === 'SHIFTED'
      });
    });

    // Generate concept shift prompt with both annotations
    this.app.post('/api/drift/concept-prompt', (req: Request, res: Response) => {
      const { oldAnnotation, newAnnotation } = req.body;

      if (!oldAnnotation || typeof oldAnnotation !== 'string') {
        return res.status(400).json({ error: 'oldAnnotation text required' });
      }
      if (!newAnnotation || typeof newAnnotation !== 'string') {
        return res.status(400).json({ error: 'newAnnotation text required' });
      }

      const conceptShiftDetector = getConceptShiftDetector();
      const prompt = conceptShiftDetector.generatePrompt(oldAnnotation, newAnnotation);

      res.json(prompt);
    });

    // Parse concept shift response
    this.app.post('/api/drift/concept-parse', (req: Request, res: Response) => {
      const { response } = req.body;

      if (!response || typeof response !== 'string') {
        return res.status(400).json({ error: 'response text required' });
      }

      const conceptShiftDetector = getConceptShiftDetector();
      const parsed = conceptShiftDetector.parseResponse(response);

      res.json(parsed);
    });

    // ----------------------------------------
    // Touched Functions Endpoints
    // ----------------------------------------

    // Get pending touched functions (not yet annotated)
    this.app.get('/api/functions/touched', (req: Request, res: Response) => {
      if (!this.graph) {
        return res.status(503).json({ error: 'Graph not initialized' });
      }

      const limit = this.getQueryAsInt(req.query.limit, 50);
      const touchedStore = getTouchedStore();
      const touched = touchedStore.getPending(limit);

      // Enrich with node info from graph
      const enriched = touched.map(t => {
        const node = this.graph!.getNodeByStableId(t.stableId);
        return {
          ...t,
          name: node?.name,
          kind: node?.kind,
          signature: node?.signature,
          hasAnnotation: !!node?.annotation,
        };
      }).filter(t => t.name); // Only include functions that still exist

      res.json({ touched: enriched, count: enriched.length });
    });

    // Get touched functions statistics
    this.app.get('/api/functions/touched/stats', (_req: Request, res: Response) => {
      const touchedStore = getTouchedStore();
      const stats = touchedStore.getStats();
      res.json(stats);
    });

    // Mark function as annotated (clear from touched queue)
    this.app.post('/api/functions/touched/:stableId/annotated', (req: Request, res: Response) => {
      const stableId = decodeURIComponent(this.getParamAsString(req.params.stableId));
      const touchedStore = getTouchedStore();
      const success = touchedStore.markAnnotated(stableId);
      res.json({ success, stableId });
    });

    // ========================================
    // Rules API
    // ========================================

    // Get all rules
    this.app.get('/api/rules', (_req: Request, res: Response) => {
      const ruleStore = getRuleStore();
      const rules = ruleStore.getAllRules();
      res.json(rules);
    });

    // Get rule stats
    this.app.get('/api/rules/stats', (_req: Request, res: Response) => {
      const ruleStore = getRuleStore();
      const stats = ruleStore.getStats();
      res.json(stats);
    });

    // Get recent violations
    this.app.get('/api/rules/violations', (req: Request, res: Response) => {
      const limit = this.getQueryAsInt(req.query.limit, 50);
      const ruleStore = getRuleStore();
      const violations = ruleStore.getRecentViolations(limit);
      res.json(violations);
    });

    // Get single rule
    this.app.get('/api/rules/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const ruleStore = getRuleStore();
      const rule = ruleStore.getRule(id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      res.json(rule);
    });

    // Create rule
    this.app.post('/api/rules', (req: Request, res: Response) => {
      const { id, name, condition, threshold, action, enabled } = req.body;
      if (!id || !name || !condition || !action) {
        res.status(400).json({ error: 'Missing required fields: id, name, condition, action' });
        return;
      }
      const ruleStore = getRuleStore();
      try {
        ruleStore.saveRule({ id, name, condition, threshold, action, enabled: enabled ?? true });
        res.status(201).json({ success: true, id });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });

    // Update rule
    this.app.patch('/api/rules/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const ruleStore = getRuleStore();
      const success = ruleStore.updateRule(id, req.body);
      if (!success) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      res.json({ success: true, id });
    });

    // Delete rule
    this.app.delete('/api/rules/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const ruleStore = getRuleStore();
      const success = ruleStore.deleteRule(id);
      if (!success) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      res.json({ success: true, id });
    });

    // Get evaluation history for a rule
    this.app.get('/api/rules/:id/evaluations', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const limit = this.getQueryAsInt(req.query.limit, 50);
      const ruleStore = getRuleStore();
      const evaluations = ruleStore.getEvaluationHistory(id, limit);
      res.json(evaluations);
    });

    // Evaluate all enabled rules
    this.app.post('/api/rules/evaluate', (_req: Request, res: Response) => {
      const evaluator = getRuleEvaluator();
      const violations = evaluator.evaluateAll();
      const result = {
        evaluatedAt: Date.now(),
        violationCount: violations.length,
        violations,
      };

      // Broadcast violations if any
      if (violations.length > 0) {
        this.broadcast({ type: 'rules:violation', payload: violations });
      }

      res.json(result);
    });

    // Evaluate a single rule
    this.app.post('/api/rules/:id/evaluate', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const ruleStore = getRuleStore();
      const rule = ruleStore.getRule(id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      const evaluator = getRuleEvaluator();
      const result = evaluator.evaluateRule(rule);

      // Record evaluation
      ruleStore.recordEvaluation(
        rule.id,
        result.violated,
        result.violated ? { targetCount: result.targets.length } : undefined
      );

      res.json(result);
    });

    // ========================
    // Concepts API
    // ========================

    // Get all concept domains
    this.app.get('/api/concepts/domains', (_req: Request, res: Response) => {
      const conceptLayer = getConceptLayer();
      const domains = conceptLayer.getAllDomains();
      res.json({ domains });
    });

    // Get a specific domain
    this.app.get('/api/concepts/domains/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const conceptLayer = getConceptLayer();
      const domain = conceptLayer.getDomain(id);
      if (!domain) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      const members = conceptLayer.getDomainMembers(id);
      res.json({ domain, members });
    });

    // Create a concept domain
    this.app.post('/api/concepts/domains', (req: Request, res: Response) => {
      const { name, description } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const conceptLayer = getConceptLayer();
      const domain = conceptLayer.createDomain(name, description);
      res.status(201).json(domain);
    });

    // Update a concept domain
    this.app.patch('/api/concepts/domains/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const { name, description } = req.body;
      const conceptLayer = getConceptLayer();
      const success = conceptLayer.updateDomain(id, { name, description });
      if (!success) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      const domain = conceptLayer.getDomain(id);
      res.json(domain);
    });

    // Delete a concept domain
    this.app.delete('/api/concepts/domains/:id', (req: Request, res: Response) => {
      const id = this.getParamAsString(req.params.id);
      const conceptLayer = getConceptLayer();
      const success = conceptLayer.deleteDomain(id);
      if (!success) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      res.status(204).send();
    });

    // Semantic search
    this.app.get('/api/concepts/search', async (req: Request, res: Response) => {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Query parameter q is required' });
        return;
      }
      const limit = parseInt(req.query.limit as string) || 10;
      const conceptLayer = getConceptLayer();
      const results = await conceptLayer.semanticSearch(query, limit);
      res.json({ results });
    });

    // Get concept shifts
    this.app.get('/api/concepts/shifts', (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 20;
      const unreviewed = req.query.unreviewed === 'true';
      const conceptLayer = getConceptLayer();
      const shifts = unreviewed
        ? conceptLayer.getUnreviewedShifts(limit)
        : conceptLayer.getRecentShifts(limit);

      // Enrich with domain names
      const enrichedShifts = shifts.map(s => ({
        ...s,
        fromDomain: s.fromDomainId ? conceptLayer.getDomain(s.fromDomainId)?.name : undefined,
        toDomain: s.toDomainId ? conceptLayer.getDomain(s.toDomainId)?.name : undefined,
        reviewed: !!s.reviewedAt,
      }));

      res.json({ shifts: enrichedShifts });
    });

    // Mark a concept shift as reviewed
    this.app.post('/api/concepts/shifts/:id/review', (req: Request, res: Response) => {
      const id = parseInt(this.getParamAsString(req.params.id));
      const { reviewedBy } = req.body;
      if (!reviewedBy) {
        res.status(400).json({ error: 'reviewedBy is required' });
        return;
      }
      const conceptLayer = getConceptLayer();
      const success = conceptLayer.markShiftReviewed(id, reviewedBy);
      if (!success) {
        res.status(404).json({ error: 'Shift not found' });
        return;
      }
      res.json({ success: true });
    });

    // Get concept layer stats
    this.app.get('/api/concepts/stats', (_req: Request, res: Response) => {
      const conceptLayer = getConceptLayer();
      const stats = conceptLayer.getStats();
      res.json(stats);
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

    // Wire up rule evaluator
    const evaluator = getRuleEvaluator();
    evaluator.setGraph(graph);

    // Wire up concept layer for semantic search
    const conceptLayer = getConceptLayer();
    conceptLayer.setGraph(graph);

    // Wire up snapshot generator
    const snapshotGenerator = getSnapshotGenerator();
    snapshotGenerator.setGraph(graph);

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

    // Listen for drift events
    detector.on('drift:detected', (driftResults: Array<{
      nodeId: string;
      driftId: number;
      severity?: string;
      driftType?: string;
    }>) => {
      this.broadcast({ type: 'drift:detected', payload: driftResults });
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
