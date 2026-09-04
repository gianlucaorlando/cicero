/**
 * Best-effort sliding-window limiter, scoped to the current isolate.
 * It caps runaway spend on paid upstreams without needing KV or Durable Objects.
 */
const windows = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000) };
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) windows.clear();
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientKey(request: Request, userId?: string | null) {
  return userId || request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'anonymous';
}
