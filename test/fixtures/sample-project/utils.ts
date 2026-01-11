/**
 * Utility functions for testing
 */

export async function hashPassword(password: string): Promise<string> {
  // Simulated password hashing
  return `hashed:${password}`;
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  const expectedHash = await hashPassword(password);
  return expectedHash === hash;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2);
}
