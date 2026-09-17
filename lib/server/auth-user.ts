import { getAuth0Config, getAuth0User } from '@/lib/auth0-server';

export type RequestUser = { userId: string };

/**
 * Resolves the caller identity.
 *
 * Auth0 bearer tokens win. The OpenAI Sites header is proof of identity only
 * behind the Sites proxy, which strips and re-adds it; anywhere else anyone can
 * send it. So trusting it is an explicit opt-in (CICERO_TRUST_SITES_HEADER=1)
 * rather than the silent consequence of an incomplete Auth0 configuration: a
 * single missing AUTH0_* value would otherwise open every profile to a header.
 */
export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const auth0User = await getAuth0User(request);
  if (auth0User) return { userId: `auth0:${auth0User.userId}` };
  if (getAuth0Config()) return null;

  if (process.env.CICERO_TRUST_SITES_HEADER !== '1') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Auth0 is not configured and CICERO_TRUST_SITES_HEADER is off: personal data stays unreachable.');
    }
    return null;
  }

  const sitesUserId = request.headers.get('oai-authenticated-user-id')?.trim();
  return sitesUserId ? { userId: `sites:${sitesUserId.slice(0, 249)}` } : null;
}
