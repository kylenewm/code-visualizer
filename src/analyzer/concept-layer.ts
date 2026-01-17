/**
 * Concept Layer
 * Manages semantic domains (concept clusters) for codebase understanding
 * Provides a shared vocabulary between human and Claude
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../storage/sqlite.js';
import { getAnnotationStore } from '../storage/annotation-store.js';
import { getSemanticCompare } from './semantic-compare.js';
import type { CodeGraph } from '../graph/graph.js';
import type { GraphNode } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface ConceptDomain {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  centroidEmbedding?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface DomainMember {
  domainId: string;
  nodeId: string;
  stableId: string;
  similarity: number;
  addedAt: number;
}

export interface ConceptShiftEvent {
  id: number;
  nodeId: string;
  stableId: string;
  fromDomainId?: string;
  toDomainId?: string;
  shiftReason?: string;
  similarity?: number;
  detectedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface SemanticSearchResult {
  nodeId: string;
  name: string;
  filePath: string;
  annotation: string;
  similarity: number;
}

// ============================================
// Concept Layer Manager
// ============================================

export class ConceptLayer {
  private graph: CodeGraph | null = null;

  setGraph(graph: CodeGraph): void {
    this.graph = graph;
  }

  // ----------------------------------------
  // Domain CRUD
  // ----------------------------------------

  /**
   * Create a new concept domain
   */
  createDomain(name: string, description?: string): ConceptDomain {
    const db = getDatabase();
    const id = uuidv4();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO concept_domains (id, name, description, member_count, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `);
    stmt.run(id, name, description ?? null, now, now);

    return {
      id,
      name,
      description,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get all domains
   */
  getAllDomains(): ConceptDomain[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        name,
        description,
        member_count as memberCount,
        created_at as createdAt,
        updated_at as updatedAt
      FROM concept_domains
      ORDER BY member_count DESC
    `);
    return stmt.all() as ConceptDomain[];
  }

  /**
   * Get all domains with their top N member function names
   */
  getDomainsWithTopMembers(topN: number = 3): Array<ConceptDomain & { topMembers: string[] }> {
    const domains = this.getAllDomains();
    return domains.map(domain => {
      const members = this.getDomainMembers(domain.id);
      const topMembers = members
        .slice(0, topN)
        .map(m => {
          // Extract function name from nodeId (format: filePath:kind:name:hash)
          const parts = m.nodeId.split(':');
          return parts.length >= 3 ? parts[2] : m.nodeId;
        });
      return { ...domain, topMembers };
    });
  }

  /**
   * Get a domain by ID
   */
  getDomain(id: string): ConceptDomain | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        name,
        description,
        member_count as memberCount,
        created_at as createdAt,
        updated_at as updatedAt
      FROM concept_domains
      WHERE id = ?
    `);
    return stmt.get(id) as ConceptDomain | null;
  }

  /**
   * Update domain metadata
   */
  updateDomain(id: string, updates: { name?: string; description?: string }): boolean {
    const db = getDatabase();
    const now = Date.now();

    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }

    values.push(id);

    const stmt = db.prepare(`
      UPDATE concept_domains
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Delete a domain
   */
  deleteDomain(id: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM concept_domains WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ----------------------------------------
  // Domain Membership
  // ----------------------------------------

  /**
   * Add a node to a domain
   */
  addMember(domainId: string, nodeId: string, stableId: string, similarity: number): boolean {
    const db = getDatabase();
    const now = Date.now();

    try {
      db.transaction(() => {
        // Insert or replace membership
        const memberStmt = db.prepare(`
          INSERT OR REPLACE INTO concept_domain_members (domain_id, node_id, stable_id, similarity, added_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        memberStmt.run(domainId, nodeId, stableId, similarity, now);

        // Update member count
        const countStmt = db.prepare(`
          UPDATE concept_domains
          SET member_count = (SELECT COUNT(*) FROM concept_domain_members WHERE domain_id = ?),
              updated_at = ?
          WHERE id = ?
        `);
        countStmt.run(domainId, now, domainId);
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a node from a domain
   */
  removeMember(domainId: string, nodeId: string): boolean {
    const db = getDatabase();
    const now = Date.now();

    try {
      db.transaction(() => {
        const deleteStmt = db.prepare(`
          DELETE FROM concept_domain_members WHERE domain_id = ? AND node_id = ?
        `);
        deleteStmt.run(domainId, nodeId);

        const countStmt = db.prepare(`
          UPDATE concept_domains
          SET member_count = (SELECT COUNT(*) FROM concept_domain_members WHERE domain_id = ?),
              updated_at = ?
          WHERE id = ?
        `);
        countStmt.run(domainId, now, domainId);
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get members of a domain
   */
  getDomainMembers(domainId: string): DomainMember[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        domain_id as domainId,
        node_id as nodeId,
        stable_id as stableId,
        similarity,
        added_at as addedAt
      FROM concept_domain_members
      WHERE domain_id = ?
      ORDER BY similarity DESC
    `);
    return stmt.all(domainId) as DomainMember[];
  }

  /**
   * Get domain for a node
   */
  getNodeDomain(nodeId: string): { domain: ConceptDomain; similarity: number } | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        d.id,
        d.name,
        d.description,
        d.member_count as memberCount,
        d.created_at as createdAt,
        d.updated_at as updatedAt,
        m.similarity
      FROM concept_domain_members m
      JOIN concept_domains d ON d.id = m.domain_id
      WHERE m.node_id = ?
    `);
    const row = stmt.get(nodeId) as (ConceptDomain & { similarity: number }) | undefined;
    if (!row) return null;

    return {
      domain: {
        id: row.id,
        name: row.name,
        description: row.description,
        memberCount: row.memberCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      similarity: row.similarity,
    };
  }

  // ----------------------------------------
  // Concept Shift Events
  // ----------------------------------------

  /**
   * Record a concept shift
   */
  recordConceptShift(
    nodeId: string,
    stableId: string,
    fromDomainId: string | null,
    toDomainId: string | null,
    shiftReason?: string,
    similarity?: number
  ): number {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO concept_shift_events
      (node_id, stable_id, from_domain_id, to_domain_id, shift_reason, similarity, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(nodeId, stableId, fromDomainId, toDomainId, shiftReason ?? null, similarity ?? null, now);
    return result.lastInsertRowid as number;
  }

  /**
   * Get recent concept shifts
   */
  getRecentShifts(limit: number = 20): ConceptShiftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        from_domain_id as fromDomainId,
        to_domain_id as toDomainId,
        shift_reason as shiftReason,
        similarity,
        detected_at as detectedAt,
        reviewed_at as reviewedAt,
        reviewed_by as reviewedBy
      FROM concept_shift_events
      ORDER BY detected_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as ConceptShiftEvent[];
  }

  /**
   * Get unreviewed concept shifts
   */
  getUnreviewedShifts(limit: number = 50): ConceptShiftEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT
        id,
        node_id as nodeId,
        stable_id as stableId,
        from_domain_id as fromDomainId,
        to_domain_id as toDomainId,
        shift_reason as shiftReason,
        similarity,
        detected_at as detectedAt,
        reviewed_at as reviewedAt,
        reviewed_by as reviewedBy
      FROM concept_shift_events
      WHERE reviewed_at IS NULL
      ORDER BY detected_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as ConceptShiftEvent[];
  }

  /**
   * Mark a concept shift as reviewed
   */
  markShiftReviewed(shiftId: number, reviewedBy: string): boolean {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE concept_shift_events
      SET reviewed_at = ?, reviewed_by = ?
      WHERE id = ?
    `);
    const result = stmt.run(now, reviewedBy, shiftId);
    return result.changes > 0;
  }

  // ----------------------------------------
  // Semantic Search
  // ----------------------------------------

  /**
   * Search for functions semantically similar to a query
   */
  async semanticSearch(query: string, limit: number = 10): Promise<SemanticSearchResult[]> {
    if (!this.graph) return [];

    const semanticCompare = getSemanticCompare();
    const annotationStore = getAnnotationStore();
    const nodes = this.graph.getAllNodes();
    const results: SemanticSearchResult[] = [];

    // Get query embedding
    const queryEmbedding = await semanticCompare.getEmbedding(query);
    if (!queryEmbedding) {
      // Fallback to text-based search
      return this.textSearch(query, limit);
    }

    // Compare with all annotated functions
    for (const node of nodes) {
      if (node.kind !== 'function' && node.kind !== 'method') continue;

      const annotation = annotationStore.getCurrent(node.stableId);
      if (!annotation) continue;

      const comparison = await semanticCompare.compare(query, annotation.text);

      results.push({
        nodeId: node.id,
        name: node.name,
        filePath: node.filePath,
        annotation: annotation.text,
        similarity: comparison.similarity,
      });
    }

    // Sort by similarity and return top matches
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Text-based search fallback
   */
  private textSearch(query: string, limit: number): SemanticSearchResult[] {
    if (!this.graph) return [];

    const annotationStore = getAnnotationStore();
    const nodes = this.graph.getAllNodes();
    const results: SemanticSearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const node of nodes) {
      if (node.kind !== 'function' && node.kind !== 'method') continue;

      const annotation = annotationStore.getCurrent(node.stableId);
      if (!annotation) continue;

      const text = annotation.text.toLowerCase();
      if (text.includes(queryLower) || node.name.toLowerCase().includes(queryLower)) {
        // Simple relevance score based on match position
        const matchPos = text.indexOf(queryLower);
        const similarity = matchPos >= 0 ? 1 - (matchPos / text.length) * 0.5 : 0.5;

        results.push({
          nodeId: node.id,
          name: node.name,
          filePath: node.filePath,
          annotation: annotation.text,
          similarity,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  // ----------------------------------------
  // Domain Detection (for a node)
  // ----------------------------------------

  /**
   * Find the closest domain for an annotation
   */
  async findClosestDomain(annotationText: string): Promise<{ domain: ConceptDomain; similarity: number } | null> {
    const domains = this.getAllDomains();
    if (domains.length === 0) return null;

    const semanticCompare = getSemanticCompare();
    let bestMatch: { domain: ConceptDomain; similarity: number } | null = null;

    for (const domain of domains) {
      // Get a representative annotation from the domain (first member)
      const members = this.getDomainMembers(domain.id);
      if (members.length === 0) continue;

      // Use the domain description if available, otherwise use first member's annotation
      let domainText = domain.description;
      if (!domainText && this.graph) {
        const firstMember = members[0];
        const annotation = getAnnotationStore().getCurrent(firstMember.stableId);
        domainText = annotation?.text;
      }

      if (!domainText) continue;

      const comparison = await semanticCompare.compare(annotationText, domainText);

      if (!bestMatch || comparison.similarity > bestMatch.similarity) {
        bestMatch = { domain, similarity: comparison.similarity };
      }
    }

    return bestMatch;
  }

  // ----------------------------------------
  // Statistics
  // ----------------------------------------

  /**
   * Get concept layer statistics
   */
  getStats(): {
    domainCount: number;
    totalMembers: number;
    unreviewedShifts: number;
    recentShifts: number;
  } {
    const db = getDatabase();

    const domainCount = (db.prepare('SELECT COUNT(*) as count FROM concept_domains').get() as { count: number }).count;
    const totalMembers = (db.prepare('SELECT COUNT(*) as count FROM concept_domain_members').get() as { count: number }).count;
    const unreviewedShifts = (db.prepare('SELECT COUNT(*) as count FROM concept_shift_events WHERE reviewed_at IS NULL').get() as { count: number }).count;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentShifts = (db.prepare('SELECT COUNT(*) as count FROM concept_shift_events WHERE detected_at >= ?').get(weekAgo) as { count: number }).count;

    return {
      domainCount,
      totalMembers,
      unreviewedShifts,
      recentShifts,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: ConceptLayer | null = null;

export function getConceptLayer(): ConceptLayer {
  if (!instance) {
    instance = new ConceptLayer();
  }
  return instance;
}
