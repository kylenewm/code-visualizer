/**
 * Concept Shift Detector
 * Compares old vs new annotations to detect when a function's PURPOSE changed,
 * not just its implementation.
 */

import { getDriftStore, type DriftEvent } from '../storage/drift-store.js';
import { getAnnotationStore } from '../storage/annotation-store.js';

// ============================================
// Types
// ============================================

export type ConceptShiftResult = 'SAME' | 'SHIFTED' | 'UNCLEAR';

export interface ConceptShiftAnalysis {
  result: ConceptShiftResult;
  oldAnnotation: string;
  newAnnotation: string;
  reason?: string;
}

export interface ConceptShiftPrompt {
  prompt: string;
  oldAnnotation: string;
  newAnnotation: string;
}

// ============================================
// Concept Shift Detector
// ============================================

export class ConceptShiftDetector {
  /**
   * Generate a prompt for Claude to analyze concept shift
   * Returns null if there's no old annotation to compare
   */
  generatePrompt(oldAnnotation: string, newAnnotation: string): ConceptShiftPrompt {
    const prompt = `Compare these two annotations for the same function and determine if the core PURPOSE changed.

Old annotation: "${oldAnnotation}"

New annotation: "${newAnnotation}"

Did the core purpose/intent of this function change, or just implementation details?

Reply with exactly one of:
- SAME - The purpose is the same, only wording or implementation details changed
- SHIFTED - The core purpose/intent of the function changed
- UNCLEAR - Cannot determine if purpose changed

If SHIFTED, add a one-sentence explanation on a new line starting with "Reason: "

Example responses:
SAME
SHIFTED
Reason: Function now handles authentication instead of just validation.
UNCLEAR`;

    return { prompt, oldAnnotation, newAnnotation };
  }

  /**
   * Parse Claude's response to extract shift result and reason
   */
  parseResponse(response: string): ConceptShiftAnalysis & { parsed: boolean } {
    const lines = response.trim().split('\n');
    const firstLine = lines[0]?.trim().toUpperCase();

    let result: ConceptShiftResult = 'UNCLEAR';
    let reason: string | undefined;

    if (firstLine === 'SAME') {
      result = 'SAME';
    } else if (firstLine === 'SHIFTED') {
      result = 'SHIFTED';
      // Look for reason on next lines
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.toLowerCase().startsWith('reason:')) {
          reason = line.substring(7).trim();
          break;
        }
      }
    } else if (firstLine === 'UNCLEAR') {
      result = 'UNCLEAR';
    } else {
      // Try to find the result keyword in the response
      const upperResponse = response.toUpperCase();
      if (upperResponse.includes('SAME') && !upperResponse.includes('SHIFTED')) {
        result = 'SAME';
      } else if (upperResponse.includes('SHIFTED')) {
        result = 'SHIFTED';
      }
    }

    return {
      result,
      reason,
      oldAnnotation: '',
      newAnnotation: '',
      parsed: result !== 'UNCLEAR' || firstLine === 'UNCLEAR',
    };
  }

  /**
   * Check if concept shift detection is needed for a drift event
   * Only needed when there's an old annotation to compare
   */
  needsConceptCheck(driftId: number): boolean {
    const driftStore = getDriftStore();
    const drift = driftStore.getDriftEvent(driftId);

    if (!drift) return false;
    if (drift.conceptShifted !== null) return false; // Already checked
    if (!drift.oldAnnotationId) return false; // No old annotation to compare

    return true;
  }

  /**
   * Get the old annotation text for a drift event
   */
  getOldAnnotation(driftId: number): string | null {
    const driftStore = getDriftStore();
    const annotationStore = getAnnotationStore();

    const drift = driftStore.getDriftEvent(driftId);
    if (!drift || !drift.oldAnnotationId) return null;

    const annotation = annotationStore.getVersion(drift.oldAnnotationId);
    return annotation?.text ?? null;
  }

  /**
   * Record concept shift result for a drift event
   */
  recordResult(driftId: number, result: ConceptShiftResult, reason?: string): boolean {
    const driftStore = getDriftStore();
    const shifted = result === 'SHIFTED';
    return driftStore.updateConceptShift(driftId, shifted, reason);
  }

  /**
   * Get drift events that need concept checking
   */
  getPendingChecks(limit: number = 50): DriftEvent[] {
    const driftStore = getDriftStore();
    const unresolved = driftStore.getUnresolved(limit * 2); // Get extra to filter

    // Filter to only those with old annotations and no concept check yet
    return unresolved
      .filter(d => d.oldAnnotationId && d.conceptShifted === null)
      .slice(0, limit);
  }

  /**
   * Get all drift events where a concept shift was detected
   */
  getConceptShifts(limit: number = 50): DriftEvent[] {
    const driftStore = getDriftStore();
    return driftStore.getConceptShifts(limit);
  }

  /**
   * Get count of detected concept shifts
   */
  getConceptShiftCount(): number {
    const driftStore = getDriftStore();
    return driftStore.getConceptShiftCount();
  }
}

// ============================================
// Singleton
// ============================================

let instance: ConceptShiftDetector | null = null;

export function getConceptShiftDetector(): ConceptShiftDetector {
  if (!instance) {
    instance = new ConceptShiftDetector();
  }
  return instance;
}
