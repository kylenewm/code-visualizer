/**
 * E2E Test Fixture: Database Operations
 */

const records: unknown[] = [];

/** Save data to database */
export function saveToDb(data: unknown): void {
  records.push(data);
  logWrite(data);
}

/** Get all records */
export function getAllRecords(): unknown[] {
  return [...records];
}

/** Clear all records */
export function clearDb(): void {
  records.length = 0;
}

/** Log database write (internal) */
function logWrite(data: unknown): void {
  console.log('DB write:', data);
}
