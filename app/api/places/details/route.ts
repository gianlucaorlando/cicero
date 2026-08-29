const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'primaryType',
  'businessStatus',
  'currentOpeningHours',
  'priceLevel',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'websiteUri',
].join(',');

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'PLACES_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{8,300}$/.test(id)) {
    return Response.json({ error: 'INVALID_PLACE_ID' }, { status: 400 });
  }

  const googleResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=it`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });

  const place = await googleResponse.json() as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    primaryType?: string;
    businessStatus?: string;
    currentOpeningHours?: {
      openNow?: boolean;
      nextOpenTime?: string;
      nextCloseTime?: string;
      weekdayDescriptions?: string[];
    };
    priceLevel?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    websiteUri?: string;
    error?: { message?: string };
  };

  if (!googleResponse.ok) {
    return Response.json(
      { error: 'PLACES_UPSTREAM_ERROR', message: place.error?.message || 'Dettagli non disponibili.' },
      { status: googleResponse.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json({
    place: {
      id: place.id || id,
      name: place.displayName?.text || 'Luogo senza nome',
      address: place.formattedAddress || '',
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      primaryType: place.primaryType || 'point_of_interest',
      businessStatus: place.businessStatus || null,
      openNow: place.currentOpeningHours?.openNow ?? null,
      nextOpenTime: place.currentOpeningHours?.nextOpenTime || null,
      nextCloseTime: place.currentOpeningHours?.nextCloseTime || null,
      weekdayDescriptions: place.currentOpeningHours?.weekdayDescriptions || [],
      priceLevel: place.priceLevel || null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      googleMapsUri: place.googleMapsUri || null,
      websiteUri: place.websiteUri || null,
    },
    source: 'google_places',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
