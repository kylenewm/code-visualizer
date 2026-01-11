/**
 * E2E Test Fixture: Data Processing
 *
 * Call graph:
 *   processData
 *     -> transformData
 *     -> saveToDb
 */

import { saveToDb } from './database';

/** Process validated data */
export function processData(data: object): ProcessedResult {
  // Transform the data
  const transformed = transformData(data);

  // Save to database
  saveToDb(transformed);

  return {
    success: true,
    data: transformed,
  };
}

/** Transform data into required format */
function transformData(input: object): TransformedData {
  return {
    ...input,
    timestamp: Date.now(),
    version: 1,
  };
}

interface ProcessedResult {
  success: boolean;
  data: TransformedData;
}

interface TransformedData {
  timestamp: number;
  version: number;
  [key: string]: unknown;
}
