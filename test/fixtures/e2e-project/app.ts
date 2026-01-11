/**
 * E2E Test Fixture: Single-File App
 *
 * All calls within one file to test the current call resolution.
 *
 * Call graph:
 *   handleRequest (entry)
 *     -> validateInput
 *     -> processData
 *       -> transformData
 *       -> saveToDb
 *         -> logWrite
 *     -> formatResponse
 *       -> toJson
 */

// ============================================
// Request Handler (Entry Point)
// ============================================

/** Main request handler - the entry point for processing requests */
export async function handleRequest(req: Request): Promise<Response> {
  const input = await req.json();

  // Validate first
  const validated = validateInput(input);

  // Process the data
  const result = processData(validated);

  // Format and return
  return formatResponse(result);
}

/** Health check endpoint - simple status check */
export function healthCheck(): StatusResponse {
  return { status: 'ok', timestamp: Date.now() };
}

// ============================================
// Validation
// ============================================

/** Validate input data before processing */
function validateInput(data: unknown): ValidatedData {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid input');
  }
  return data as ValidatedData;
}

/** Custom validation error class */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================
// Processing
// ============================================

/** Process validated data through the pipeline */
function processData(data: ValidatedData): ProcessedResult {
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
function transformData(input: ValidatedData): TransformedData {
  return {
    ...input,
    timestamp: Date.now(),
    version: 1,
  };
}

// ============================================
// Database
// ============================================

const records: TransformedData[] = [];

/** Save data to database */
function saveToDb(data: TransformedData): void {
  records.push(data);
  logWrite(data);
}

/** Get all records from database */
export function getAllRecords(): TransformedData[] {
  return [...records];
}

/** Clear all records */
export function clearDb(): void {
  records.length = 0;
}

/** Log database write (internal) */
function logWrite(data: TransformedData): void {
  console.log('DB write:', data);
}

// ============================================
// Response Formatting
// ============================================

/** Format data as HTTP response */
function formatResponse(data: ProcessedResult): Response {
  const json = toJson(data);
  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Convert to JSON string */
function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Parse JSON safely */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ============================================
// Types
// ============================================

interface ValidatedData {
  [key: string]: unknown;
}

interface TransformedData {
  timestamp: number;
  version: number;
  [key: string]: unknown;
}

interface ProcessedResult {
  success: boolean;
  data: TransformedData;
}

interface StatusResponse {
  status: string;
  timestamp: number;
}
