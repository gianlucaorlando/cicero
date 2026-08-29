type SearchPayload = {
  query?: unknown;
  lat?: unknown;
  lng?: unknown;
  radiusMeters?: unknown;
  openNow?: unknown;
};

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.businessStatus',
  'places.googleMapsUri',
].join(',');

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'PLACES_NOT_CONFIGURED', message: 'Google Places non è ancora configurato.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: SearchPayload;
  try {
    payload = await request.json() as SearchPayload;
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const query = typeof payload.query === 'string' ? payload.query.trim().slice(0, 120) : '';
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const radiusMeters = Math.min(5000, Math.max(100, Number(payload.radiusMeters) || 1200));
  const openNow = payload.openNow !== false;

  if (!query || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const googleResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'it',
      pageSize: 3,
      openNow,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }),
  });

  const data = await googleResponse.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      primaryType?: string;
      businessStatus?: string;
      googleMapsUri?: string;
    }>;
    error?: { message?: string; status?: string };
  };

  if (!googleResponse.ok) {
    return Response.json(
      { error: 'PLACES_UPSTREAM_ERROR', message: data.error?.message || 'Places non disponibile.' },
      { status: googleResponse.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const places = (data.places || [])
    .filter((place) => place.id && place.displayName?.text && place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      id: place.id!,
      name: place.displayName!.text!,
      address: place.formattedAddress || '',
      lat: place.location!.latitude!,
      lng: place.location!.longitude!,
      primaryType: place.primaryType || 'point_of_interest',
      businessStatus: place.businessStatus || null,
      googleMapsUri: place.googleMapsUri || null,
    }));

  return Response.json(
    { places, source: 'google_places' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
