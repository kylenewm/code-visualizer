/**
 * E2E Test Fixture: Input Validation
 */

/** Validate input data */
export function validateInput(data: unknown): ValidatedData {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid input');
  }
  return data as ValidatedData;
}

/** Check if value is a string */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Check if value is a number */
function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/** Custom validation error */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface ValidatedData {
  [key: string]: unknown;
}
