/**
 * Tells the client whether the hidden GUI test panel may be shown.
 * Enabled in development, or in any environment that sets CICERO_TEST_PANEL=1.
 */
export async function GET() {
  const enabled = process.env.NODE_ENV !== 'production' || process.env.CICERO_TEST_PANEL === '1';
  return new Response(null, { status: enabled ? 204 : 404, headers: { 'Cache-Control': 'no-store' } });
}
