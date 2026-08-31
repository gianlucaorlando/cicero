import { getAuth0Config } from '@/lib/auth0-server';

export async function GET() {
  const config = getAuth0Config();
  if (!config) {
    return Response.json(
      { error: 'AUTH0_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    {
      domain: config.domain,
      clientId: config.clientId,
      audience: config.audience,
    },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
