/**
 * Liveness for the host's health checks (Render pings it before switching
 * traffic to a new deploy). It touches no paid upstream and no database.
 */
export async function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
