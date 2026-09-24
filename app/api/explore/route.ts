import { isValidLatLng } from '@/lib/geo';
import { getRequestUser } from '@/lib/server/auth-user';
import { exploreArea } from '@/lib/server/discover';
import { errorResponse, json } from '@/lib/server/http';
import { PlacesError } from '@/lib/server/places';
import { clientKey, enforceRateLimits, exploreRateLimitRules } from '@/lib/server/rate-limit';

/** Popular sights and places to eat in the area on screen, for pins that follow the map. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const center = { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) };
  const radius = Number(url.searchParams.get('radius'));
  if (!isValidLatLng(center) || !Number.isFinite(radius) || radius < 50 || radius > 50_000) return errorResponse('INVALID_REQUEST', 400);

  const user = await getRequestUser(request);
  const rules = exploreRateLimitRules(clientKey(request, user?.userId));
  const limit = rules ? await enforceRateLimits(rules) : { allowed: true, retryAfterSeconds: 0 };
  if (!limit.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Troppe richieste in poco tempo.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    return json({ places: await exploreArea(center, radius) });
  } catch (error) {
    if (error instanceof PlacesError) return errorResponse(error.code, error.status, error.message);
    console.error('explore failed', error);
    return errorResponse('EXPLORE_FAILED', 502, 'Luoghi della zona non disponibili.');
  }
}
