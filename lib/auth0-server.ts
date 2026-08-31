import { createRemoteJWKSet, jwtVerify } from 'jose';

type Auth0Config = {
  domain: string;
  clientId: string;
  audience: string;
  issuer: string;
};

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizedDomain(value: string) {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function getAuth0Config(): Auth0Config | null {
  const domain = normalizedDomain(process.env.AUTH0_DOMAIN || '');
  const clientId = (process.env.AUTH0_CLIENT_ID || '').trim();
  const audience = (process.env.AUTH0_AUDIENCE || '').trim();

  if (!domain || !clientId || !audience || !/^[A-Za-z0-9.-]+$/.test(domain)) return null;

  return {
    domain,
    clientId,
    audience,
    issuer: `https://${domain}/`,
  };
}

function getJwks(issuer: string) {
  const cached = jwksByIssuer.get(issuer);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}

export async function getAuth0User(request: Request) {
  const config = getAuth0Config();
  if (!config) return null;

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], getJwks(config.issuer), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });

    return typeof payload.sub === 'string' && payload.sub
      ? { userId: payload.sub.slice(0, 255) }
      : null;
  } catch {
    return null;
  }
}
