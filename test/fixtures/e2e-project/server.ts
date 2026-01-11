/**
 * E2E Test Fixture: Server Entry Point
 *
 * Call graph:
 *   handleRequest (entry)
 *     -> validateInput
 *     -> processData
 *       -> transformData
 *       -> saveToDb
 *     -> formatResponse
 */

import { validateInput } from './validation';
import { processData } from './processor';
import { formatResponse } from './utils';

/** Main request handler - entry point */
export async function handleRequest(req: Request): Promise<Response> {
  const input = await req.json();

  // Validate first
  const validated = validateInput(input);

  // Process the data
  const result = processData(validated);

  // Format and return
  return formatResponse(result);
}

/** Health check endpoint */
export function healthCheck(): { status: string } {
  return { status: 'ok' };
}
