import { getAuth0Config, getAuth0User } from '@/lib/auth0-server';

export type RequestUser = { userId: string };

/**
 * Resolves the caller identity.
 * Auth0 bearer tokens win. The OpenAI Sites header is trusted only when Auth0
 * is not configured, because outside the Sites proxy that header is forgeable.
 */
export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const auth0User = await getAuth0User(request);
  if (auth0User) return { userId: `auth0:${auth0User.userId}` };
  if (getAuth0Config()) return null;

  const sitesUserId = request.headers.get('oai-authenticated-user-id')?.trim();
  return sitesUserId ? { userId: `sites:${sitesUserId.slice(0, 249)}` } : null;
}
