import { getRequestUser } from '@/lib/server/auth-user';
import { errorResponse, json } from '@/lib/server/http';
import { isValidPlaceId, PlacesError } from '@/lib/server/places';
import { clientKey, enforceRateLimits, reviewsRateLimitRules } from '@/lib/server/rate-limit';
import { cachedReviews, getPlaceReviews } from '@/lib/server/reviews';

/** The latest Google and Tripadvisor reviews of one place, for its extended sheet. */
export async function GET(request: Request) {
  const placeId = new URL(request.url).searchParams.get('placeId') ?? '';
  if (!isValidPlaceId(placeId)) return errorResponse('INVALID_REQUEST', 400);

  // A cached answer costs nothing upstream, so it does not count against the budgets.
  const hit = cachedReviews(placeId);
  if (hit) return json(hit);

  const user = await getRequestUser(request);
  const rules = reviewsRateLimitRules(clientKey(request, user?.userId));
  const limit = rules ? await enforceRateLimits(rules) : { allowed: true, retryAfterSeconds: 0 };
  if (!limit.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Troppe richieste in poco tempo.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    return json(await getPlaceReviews(placeId));
  } catch (error) {
    if (error instanceof PlacesError) return errorResponse(error.code, error.status, error.message);
    console.error('reviews failed', error);
    return errorResponse('REVIEWS_FAILED', 502, 'Recensioni non disponibili.');
  }
}
