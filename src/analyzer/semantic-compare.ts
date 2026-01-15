/**
 * Semantic Compare
 * Uses local embeddings (transformers.js) to compare text similarity
 * for smarter concept shift detection
 */

// ============================================
// Types
// ============================================

export interface SemanticSimilarity {
  similarity: number;  // 0-1, higher = more similar
  classification: 'SAME' | 'SIMILAR' | 'DIFFERENT';
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
}

// ============================================
// Thresholds for classification
// ============================================

const THRESHOLDS = {
  SAME: 0.85,      // >= 0.85 → definitely same purpose
  SIMILAR: 0.5,    // >= 0.5 → unclear, need Claude to confirm
  // < 0.5 → DIFFERENT - significant change in meaning
};

// ============================================
// Semantic Comparer
// ============================================

export class SemanticCompare {
  private pipeline: unknown = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the embedding model (lazy load)
   * Uses @xenova/transformers for local inference
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // Dynamic import to avoid loading if not used
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformers = await import('@xenova/transformers' as any) as { pipeline: (task: string, model: string) => Promise<unknown> };

      // Use all-MiniLM-L6-v2 - small, fast, good quality
      this.pipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      this.initialized = true;
      console.log('Semantic comparison model loaded');
    } catch (error) {
      console.error('Failed to load semantic comparison model:', error);
      // Mark as initialized but with null pipeline - will fallback to text comparison
      this.initialized = true;
    }
  }

  /**
   * Check if the model is available
   */
  isAvailable(): boolean {
    return this.initialized && this.pipeline !== null;
  }

  /**
   * Get embedding for a text string
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.isAvailable()) {
      await this.init();
    }

    if (!this.pipeline) {
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output = await (this.pipeline as any)(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data as Float32Array);
    } catch (error) {
      console.error('Failed to get embedding:', error);
      return null;
    }
  }

  /**
   * Compare two texts and return their similarity
   */
  async compare(text1: string, text2: string): Promise<SemanticSimilarity> {
    // Get embeddings
    const [emb1, emb2] = await Promise.all([
      this.getEmbedding(text1),
      this.getEmbedding(text2),
    ]);

    // If embeddings failed, fall back to simple text comparison
    if (!emb1 || !emb2) {
      return this.fallbackCompare(text1, text2);
    }

    // Compute cosine similarity
    const similarity = this.cosineSimilarity(emb1, emb2);

    return {
      similarity,
      classification: this.classify(similarity),
    };
  }

  /**
   * Classify similarity score
   */
  private classify(similarity: number): 'SAME' | 'SIMILAR' | 'DIFFERENT' {
    if (similarity >= THRESHOLDS.SAME) return 'SAME';
    if (similarity >= THRESHOLDS.SIMILAR) return 'SIMILAR';
    return 'DIFFERENT';
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Fallback comparison using simple text analysis
   * Used when embeddings are not available
   */
  private fallbackCompare(text1: string, text2: string): SemanticSimilarity {
    // Normalize texts
    const normalize = (text: string) =>
      text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

    const words1 = new Set(normalize(text1));
    const words2 = new Set(normalize(text2));

    // Jaccard similarity
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = union.size > 0 ? intersection.size / union.size : 0;

    return {
      similarity,
      classification: this.classify(similarity),
    };
  }

  /**
   * Batch compare multiple text pairs
   */
  async compareBatch(pairs: Array<{ text1: string; text2: string }>): Promise<SemanticSimilarity[]> {
    const results: SemanticSimilarity[] = [];

    // Process in sequence to avoid memory issues with large batches
    for (const pair of pairs) {
      results.push(await this.compare(pair.text1, pair.text2));
    }

    return results;
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: SemanticCompare | null = null;

export function getSemanticCompare(): SemanticCompare {
  if (!instance) {
    instance = new SemanticCompare();
  }
  return instance;
}

/**
 * Pre-initialize the model (call during startup)
 */
export async function initSemanticCompare(): Promise<void> {
  const compare = getSemanticCompare();
  await compare.init();
}
