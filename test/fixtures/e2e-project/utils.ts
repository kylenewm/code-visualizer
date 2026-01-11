/**
 * E2E Test Fixture: Utility Functions
 */

/** Format data as HTTP response */
export function formatResponse(data: unknown): Response {
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
