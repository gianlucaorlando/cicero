import { isValidLatLng } from '@/lib/geo';
import { getRequestUser } from '@/lib/server/auth-user';
import { discoverNearby } from '@/lib/server/discover';
import { errorResponse, json } from '@/lib/server/http';
import { PlacesError } from '@/lib/server/places';
import { clientKey, discoverRateLimitRules, enforceRateLimits } from '@/lib/server/rate-limit';

/** Points of interest around the origin, shown on the map as soon as the app opens. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) };
  if (!isValidLatLng(origin)) return errorResponse('INVALID_REQUEST', 400);

  const user = await getRequestUser(request);
  const rules = discoverRateLimitRules(clientKey(request, user?.userId));
  const limit = rules ? await enforceRateLimits(rules) : { allowed: true, retryAfterSeconds: 0 };
  if (!limit.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Troppe richieste in poco tempo.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    return json(await discoverNearby(origin));
  } catch (error) {
    if (error instanceof PlacesError) return errorResponse(error.code, error.status, error.message);
    console.error('discover failed', error);
    return errorResponse('DISCOVER_FAILED', 502, 'Punti di interesse non disponibili.');
  }
}
