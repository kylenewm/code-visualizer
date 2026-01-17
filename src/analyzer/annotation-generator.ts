/**
 * Annotation Generator
 * Generates semantic annotations for code nodes
 *
 * Currently uses template-based generation from existing metadata.
 * Future: integrate with LLM for richer annotations.
 */

import type { GraphNode } from '../types/index.js';

export interface GeneratedAnnotation {
  text: string;
  source: 'auto' | 'template';
  confidence: number;
}

export class AnnotationGenerator {
  /**
   * Generate an annotation for a single node
   */
  generateForNode(node: GraphNode): GeneratedAnnotation {
    // If node already has a description (from docstring), use it as base
    if (node.description && node.description.length > 10) {
      return {
        text: this.enhanceDescription(node),
        source: 'template',
        confidence: 0.8,
      };
    }

    // Generate from signature and context
    return {
      text: this.generateFromSignature(node),
      source: 'template',
      confidence: 0.5,
    };
  }

  /**
   * Enhance existing description with context
   */
  private enhanceDescription(node: GraphNode): string {
    const base = node.description!.trim();

    // If description is already good, just clean it up
    if (base.length > 50) {
      // Truncate to 2-3 sentences max
      const sentences = base.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 3) {
        return sentences.slice(0, 3).join('. ').trim() + '.';
      }
      return base.endsWith('.') ? base : base + '.';
    }

    // Add context based on node kind and signature
    let enhanced = base;

    if (node.kind === 'function' || node.kind === 'method') {
      // Add parameter context if useful
      if (node.params && node.params.length > 0 && base.length < 30) {
        const paramNames = node.params.map(p => p.name).join(', ');
        enhanced += ` Takes ${paramNames}.`;
      }

      // Add return type context
      if (node.returnType && node.returnType !== 'None' && node.returnType !== 'void') {
        if (!enhanced.toLowerCase().includes('return')) {
          enhanced += ` Returns ${node.returnType}.`;
        }
      }
    }

    return enhanced;
  }

  /**
   * Generate annotation from signature when no description exists
   */
  private generateFromSignature(node: GraphNode): string {
    const name = node.name;
    const kind = node.kind;

    // Convert camelCase/snake_case to words
    const words = name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .toLowerCase()
      .trim();

    // Build annotation based on naming patterns
    let annotation = '';

    // Common prefixes
    if (name.startsWith('get_') || name.startsWith('get')) {
      annotation = `Retrieves ${words.replace(/^get\s*/, '')}.`;
    } else if (name.startsWith('set_') || name.startsWith('set')) {
      annotation = `Sets ${words.replace(/^set\s*/, '')}.`;
    } else if (name.startsWith('is_') || name.startsWith('is')) {
      annotation = `Checks if ${words.replace(/^is\s*/, '')}.`;
    } else if (name.startsWith('has_') || name.startsWith('has')) {
      annotation = `Checks if has ${words.replace(/^has\s*/, '')}.`;
    } else if (name.startsWith('create_') || name.startsWith('create')) {
      annotation = `Creates ${words.replace(/^create\s*/, '')}.`;
    } else if (name.startsWith('delete_') || name.startsWith('delete') || name.startsWith('remove')) {
      annotation = `Removes ${words.replace(/^(delete|remove)\s*/, '')}.`;
    } else if (name.startsWith('update_') || name.startsWith('update')) {
      annotation = `Updates ${words.replace(/^update\s*/, '')}.`;
    } else if (name.startsWith('validate_') || name.startsWith('validate')) {
      annotation = `Validates ${words.replace(/^validate\s*/, '')}.`;
    } else if (name.startsWith('process_') || name.startsWith('process')) {
      annotation = `Processes ${words.replace(/^process\s*/, '')}.`;
    } else if (name.startsWith('handle_') || name.startsWith('handle')) {
      annotation = `Handles ${words.replace(/^handle\s*/, '')}.`;
    } else if (name.startsWith('init') || name.startsWith('setup') || name.startsWith('configure')) {
      annotation = `Initializes ${words.replace(/^(init|setup|configure)\s*/, '') || kind}.`;
    } else {
      // Generic fallback
      annotation = `${kind.charAt(0).toUpperCase() + kind.slice(1)} that ${words}.`;
    }

    // Add parameter info if available
    if (node.params && node.params.length > 2) {
      const required = node.params.filter(p => !p.type?.includes('Optional')).length;
      annotation += ` Takes ${required} required parameter(s).`;
    }

    return annotation;
  }

  /**
   * Generate annotations for multiple nodes
   */
  generateBatch(nodes: GraphNode[]): Map<string, GeneratedAnnotation> {
    const results = new Map<string, GeneratedAnnotation>();

    for (const node of nodes) {
      results.set(node.id, this.generateForNode(node));
    }

    return results;
  }
}

// Singleton instance
let instance: AnnotationGenerator | null = null;

export function getAnnotationGenerator(): AnnotationGenerator {
  if (!instance) {
    instance = new AnnotationGenerator();
  }
  return instance;
}
