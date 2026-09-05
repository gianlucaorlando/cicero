import Anthropic from '@anthropic-ai/sdk';

import { isValidLatLng } from '@/lib/geo';
import { normalizeProfile } from '@/lib/profile';
import { getAgentConfig, runAgent } from '@/lib/server/agent/run';
import { getRequestUser } from '@/lib/server/auth-user';
import { errorResponse, json, readJson, textValue } from '@/lib/server/http';
import { isValidPlaceId } from '@/lib/server/places';
import { clientKey, rateLimit } from '@/lib/server/rate-limit';
import { normalizeStops } from '@/lib/server/stops';
import type { ChatRequest, PlaceCandidate } from '@/lib/types';

const RATE_LIMIT = {
  requests: Math.max(1, Number(process.env.CICERO_RATE_LIMIT) || 60),
  windowMs: 10 * 60 * 1000,
  enabled: process.env.NODE_ENV === 'production' || process.env.CICERO_RATE_LIMIT !== undefined,
};
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;

function normalizeCandidate(value: unknown): PlaceCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = textValue(candidate.id, 300);
  const name = textValue(candidate.name, 160);
  if (!isValidPlaceId(id) || !name || !isValidLatLng({ lat: candidate.lat, lng: candidate.lng })) return null;
  return {
    id,
    name,
    address: textValue(candidate.address, 300),
    lat: candidate.lat as number,
    lng: candidate.lng as number,
    primaryType: textValue(candidate.primaryType, 80) || 'point_of_interest',
    businessStatus: textValue(candidate.businessStatus, 40) || null,
    googleMapsUri: null,
    rating: typeof candidate.rating === 'number' ? candidate.rating : null,
    userRatingCount: typeof candidate.userRatingCount === 'number' ? candidate.userRatingCount : null,
    distanceMeters: typeof candidate.distanceMeters === 'number' ? candidate.distanceMeters : 0,
    tripadvisor: null,
  };
}

function normalizeRequest(payload: unknown): ChatRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const context = source.context && typeof source.context === 'object' ? source.context as Record<string, unknown> : null;
  if (!context || !isValidLatLng(context.origin) || !Array.isArray(source.messages)) return null;

  const messages = source.messages
    .slice(-MAX_MESSAGES)
    .map((message) => {
      const item = message && typeof message === 'object' ? message as Record<string, unknown> : {};
      const text = typeof item.text === 'string' ? item.text.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
      return item.role === 'user' || item.role === 'assistant' ? { role: item.role, text } : null;
    })
    .filter((message): message is ChatRequest['messages'][number] => message !== null && message.text.length > 0);
  if (!messages.length) return null;

  return {
    messages,
    context: {
      city: textValue(context.city, 100) || 'Milano',
      locationLabel: textValue(context.locationLabel, 180) || 'punto di partenza',
      origin: context.origin,
      weather: textValue(context.weather, 80) || 'meteo non disponibile',
      localTime: /^\d{2}:\d{2}$/.test(String(context.localTime)) ? String(context.localTime) : new Date().toISOString().slice(11, 16),
      itinerary: normalizeStops(context.itinerary),
      candidates: Array.isArray(context.candidates)
        ? context.candidates.slice(0, 10).map(normalizeCandidate).filter((candidate): candidate is PlaceCandidate => candidate !== null)
        : [],
      profile: normalizeProfile(context.profile),
    },
  };
}

export async function POST(request: Request) {
  if (!getAgentConfig()) {
    return errorResponse('LLM_NOT_CONFIGURED', 503, 'Il modello non è ancora configurato su questo server.');
  }

  const user = await getRequestUser(request);
  const limit = RATE_LIMIT.enabled
    ? rateLimit(clientKey(request, user?.userId), RATE_LIMIT.requests, RATE_LIMIT.windowMs)
    : { allowed: true, retryAfterSeconds: 0 };
  if (!limit.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Troppe richieste in poco tempo. Riprova tra qualche minuto.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const chatRequest = normalizeRequest(await readJson(request));
  if (!chatRequest) return errorResponse('INVALID_REQUEST', 400);

  try {
    return json(await runAgent(chatRequest));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return errorResponse('LLM_AUTH_ERROR', 502, 'La chiave del modello non è valida.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse('LLM_RATE_LIMITED', 503, 'Il modello è momentaneamente sovraccarico. Riprova tra poco.');
    }
    if (error instanceof Anthropic.APIError) {
      console.error('chat agent upstream error', error.status, error.message);
      return errorResponse('LLM_UPSTREAM_ERROR', 502, `Il modello ha risposto con un errore (${error.status ?? 'sconosciuto'}).`);
    }
    console.error('chat agent failed', error);
    return errorResponse('LLM_UPSTREAM_ERROR', 502, 'Il modello non è raggiungibile in questo momento.');
  }
}
