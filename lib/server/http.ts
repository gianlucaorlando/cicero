const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(data: unknown, status = 200, headers: Record<string, string> = NO_STORE) {
  return Response.json(data, { status, headers });
}

export function errorResponse(error: string, status: number, message?: string) {
  return json(message ? { error, message } : { error }, status);
}

export function unauthorized() {
  return errorResponse('AUTHENTICATION_REQUIRED', 401);
}

/** Parses a JSON body; returns null when the payload is not valid JSON. */
export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

export function textValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}
