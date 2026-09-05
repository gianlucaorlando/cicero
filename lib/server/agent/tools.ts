import type Anthropic from '@anthropic-ai/sdk';

import { candidateLetter, formatRating, humanReviewCount, priceLabel, shiftTime } from '@/lib/format';
import { distanceMeters, humanDistance } from '@/lib/geo';
import { preferenceCategories, type PreferenceCategory } from '@/lib/profile';
import { getPlaceDetails, PlacesError, searchPlaces } from '@/lib/server/places';
import type { ChatAction, ChatContext, LatLng, PlaceCandidate, PlaceDetails, ProfilePatch, Stop } from '@/lib/types';

const MAX_STOPS = 20;
const FIRST_STOP_OFFSET_MINUTES = 15;
const MINUTES_PER_STOP = 45;

export const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_places',
    description: 'Cerca luoghi reali su Google Places vicino a un punto. Le opzioni trovate vengono mostrate all\'utente con lettere A, B, C... Sostituisce le opzioni mostrate in precedenza.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Testo di ricerca in italiano, con le preferenze dell\'utente incluse (es. "trattoria senza pesce", "museo di design").' },
        near: { type: 'string', enum: ['origin', 'last_stop', 'stop'], description: 'Da dove partire: il punto di partenza, l\'ultima tappa dell\'itinerario, oppure una tappa precisa (richiede stop_id).' },
        stop_id: { type: 'string', description: 'Id della tappa da usare come centro quando near è "stop".' },
        open_now: { type: 'boolean', description: 'true per luoghi aperti adesso; false per cena, serata o giorni successivi.' },
        radius_meters: { type: 'integer', minimum: 100, maximum: 5000, description: 'Raggio di ricerca. Default 1200.' },
      },
      required: ['query', 'near', 'open_now'],
    },
  },
  {
    name: 'add_stops',
    description: 'Verifica i dettagli su Google Places e aggiunge una o più tappe in coda all\'itinerario. Accetta place_id oppure la lettera di un\'opzione mostrata.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        places: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' }, description: 'Place ID o lettere (A, B, C...) delle opzioni mostrate, nell\'ordine di visita.' },
      },
      required: ['places'],
    },
  },
  {
    name: 'get_place_details',
    description: 'Legge orari di apertura, fascia di prezzo, valutazioni e sito web di un luogo, senza aggiungerlo.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        place: { type: 'string', description: 'Place ID, lettera di un\'opzione mostrata, oppure id di una tappa.' },
      },
      required: ['place'],
    },
  },
  {
    name: 'remove_stops',
    description: 'Rimuove tappe dall\'itinerario. Le altre tappe restano invariate.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stop_ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Id delle tappe da rimuovere.' },
      },
      required: ['stop_ids'],
    },
  },
  {
    name: 'shift_times',
    description: 'Sposta gli orari di tutte le tappe avanti o indietro, mantenendo ordine e distanze.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        minutes: { type: 'integer', minimum: -720, maximum: 720, description: 'Minuti da aggiungere (negativi per anticipare).' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'update_profile',
    description: 'Salva preferenze durevoli nel profilo dell\'utente. Le preferenze apprese sono brevi etichette per categoria (massimo 4 per categoria).',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slow_pace: { type: 'boolean', description: 'Preferisce un ritmo tranquillo con meno tappe.' },
        avoid_queues: { type: 'boolean', description: 'Vuole evitare code e luoghi affollati.' },
        no_fish: { type: 'boolean', description: 'Non mangia pesce.' },
        markets: { type: 'boolean', description: 'Ama i mercati locali.' },
        learn: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              category: { type: 'string', enum: [...preferenceCategories] },
              value: { type: 'string', description: 'Etichetta breve, es. "cucina toscana", "arte contemporanea".' },
            },
            required: ['category', 'value'],
          },
        },
        forget: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              category: { type: 'string', enum: [...preferenceCategories] },
              value: { type: 'string' },
            },
            required: ['category', 'value'],
          },
        },
      },
      required: [],
    },
  },
];

type ToolOutcome = { content: string; isError?: boolean };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringList(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, max)
    : [];
}

function describeCandidate(candidate: PlaceCandidate, index: number) {
  const parts = [
    `${candidateLetter(index)}. ${candidate.name}`,
    candidate.address,
    humanDistance(candidate.distanceMeters),
    candidate.rating != null ? `Google ${formatRating(candidate.rating)} (${humanReviewCount(candidate.userRatingCount || 0)} recensioni)` : null,
    candidate.tripadvisor ? `Tripadvisor ${formatRating(candidate.tripadvisor.rating)} (${humanReviewCount(candidate.tripadvisor.reviewCount)})` : null,
    `tipo: ${candidate.primaryType}`,
    candidate.businessStatus && candidate.businessStatus !== 'OPERATIONAL' ? `stato: ${candidate.businessStatus}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function describeDetails(place: PlaceDetails) {
  const open = place.openNow === true ? 'aperto ora' : place.openNow === false ? 'chiuso ora' : 'orario non confermato';
  const parts = [
    place.name,
    place.address,
    open,
    place.nextCloseTime ? `chiude alle ${place.nextCloseTime}` : null,
    place.nextOpenTime ? `riapre alle ${place.nextOpenTime}` : null,
    priceLabel(place.priceLevel) ? `prezzo ${priceLabel(place.priceLevel)}` : null,
    place.rating != null ? `Google ${formatRating(place.rating)} (${humanReviewCount(place.userRatingCount || 0)})` : null,
    place.websiteUri ? `sito ${place.websiteUri}` : null,
    place.weekdayDescriptions.length ? `orari: ${place.weekdayDescriptions.join('; ')}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function stopTime(localTime: string, index: number) {
  return shiftTime(localTime, FIRST_STOP_OFFSET_MINUTES + index * MINUTES_PER_STOP);
}

function failure(error: unknown): ToolOutcome {
  console.error('places tool failed', error instanceof Error ? `${error.name}: ${error.message}` : error);
  if (error instanceof PlacesError) {
    return {
      isError: true,
      content: error.code === 'PLACES_NOT_CONFIGURED'
        ? 'Google Places non è configurato su questo server: non è possibile cercare o verificare luoghi.'
        : `Google Places non ha risposto correttamente: ${error.message}`,
    };
  }
  return { isError: true, content: 'Errore imprevisto durante la chiamata a Google Places.' };
}

/**
 * Executes tools for one agent turn. Mutates a working copy of the context so
 * later tool calls in the same turn see the effects of earlier ones, and
 * records the actions the client must apply.
 */
export class AgentSession {
  actions: ChatAction[] = [];
  private itinerary: Stop[];
  private candidates: PlaceCandidate[];

  constructor(private readonly context: ChatContext) {
    this.itinerary = [...context.itinerary];
    this.candidates = [...context.candidates];
  }

  async execute(name: string, rawInput: unknown): Promise<ToolOutcome> {
    const input = asRecord(rawInput);
    switch (name) {
      case 'search_places': return this.searchPlaces(input);
      case 'add_stops': return this.addStops(input);
      case 'get_place_details': return this.placeDetails(input);
      case 'remove_stops': return this.removeStops(input);
      case 'shift_times': return this.shiftTimes(input);
      case 'update_profile': return this.updateProfile(input);
      default: return { isError: true, content: `Strumento sconosciuto: ${name}` };
    }
  }

  private resolveOrigin(input: Record<string, unknown>): LatLng {
    const lastStop = this.itinerary.at(-1);
    if (input.near === 'last_stop' && lastStop) return lastStop;
    if (input.near === 'stop') {
      const stop = this.itinerary.find((item) => item.id === input.stop_id);
      if (stop) return stop;
    }
    return this.context.origin;
  }

  private resolvePlaceId(reference: string) {
    const trimmed = reference.trim();
    if (/^[A-Za-z]$/.test(trimmed)) {
      const candidate = this.candidates[trimmed.toUpperCase().charCodeAt(0) - 65];
      return candidate?.id || null;
    }
    const stop = this.itinerary.find((item) => item.id === trimmed || item.placeId === trimmed);
    return stop?.placeId || trimmed;
  }

  private async searchPlaces(input: Record<string, unknown>): Promise<ToolOutcome> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) return { isError: true, content: 'Serve un testo di ricerca.' };

    try {
      const origin = this.resolveOrigin(input);
      const candidates = await searchPlaces({
        query,
        origin,
        openNow: input.open_now !== false,
        radiusMeters: typeof input.radius_meters === 'number' ? input.radius_meters : undefined,
      });
      const fresh = candidates.filter((candidate) => !this.itinerary.some((stop) => stop.placeId === candidate.id));
      this.candidates = fresh;
      this.actions.push({ type: 'show_candidates', candidates: fresh });

      if (!fresh.length) {
        return { content: input.open_now === false ? 'Nessun luogo adatto trovato nel raggio indicato.' : 'Nessun luogo aperto adesso trovato nel raggio indicato. Puoi riprovare con open_now false o un raggio più ampio.' };
      }
      return { content: `Opzioni mostrate all'utente:\n${fresh.map(describeCandidate).join('\n')}` };
    } catch (error) {
      return failure(error);
    }
  }

  private async addStops(input: Record<string, unknown>): Promise<ToolOutcome> {
    const references = stringList(input.places, 5);
    if (!references.length) return { isError: true, content: 'Indica almeno un luogo.' };
    if (this.itinerary.length >= MAX_STOPS) return { isError: true, content: `L'itinerario ha già ${MAX_STOPS} tappe.` };

    const placeIds = references.map((reference) => this.resolvePlaceId(reference));
    if (placeIds.some((id) => !id)) return { isError: true, content: 'Una delle lettere indicate non corrisponde a un\'opzione mostrata.' };

    const results = await Promise.all(placeIds.map(async (id) => {
      try {
        return { id: id!, place: await getPlaceDetails(id!), error: null };
      } catch (error) {
        return { id: id!, place: null, error };
      }
    }));

    const added: Stop[] = [];
    const notes: string[] = [];
    let previous: LatLng = this.itinerary.at(-1) || this.context.origin;

    for (const result of results) {
      if (!result.place) {
        notes.push(`Non ho potuto verificare ${result.id}: ${failure(result.error).content}`);
        continue;
      }
      const place = result.place;
      if (this.itinerary.some((stop) => stop.placeId === place.id)) {
        notes.push(`${place.name} è già nell'itinerario.`);
        continue;
      }
      const open = place.openNow === true ? 'aperto ora' : place.openNow === false ? 'chiuso ora' : 'orario non confermato';
      const rating = place.rating != null ? `${formatRating(place.rating)} (${humanReviewCount(place.userRatingCount || 0)})` : null;
      const stop: Stop = {
        id: place.id,
        placeId: place.id,
        time: stopTime(this.context.localTime, this.itinerary.length),
        title: place.name,
        detail: [humanDistance(distanceMeters(previous, place)), open, priceLabel(place.priceLevel), rating].filter(Boolean).join(' · '),
        kind: place.primaryType === 'cafe' || place.primaryType === 'coffee_shop' ? 'coffee' : 'place',
        primaryType: place.primaryType,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        googleMapsUri: place.googleMapsUri,
        source: 'google_places',
      };
      this.itinerary.push(stop);
      added.push(stop);
      previous = stop;
      notes.push(`Aggiunta tappa ${this.itinerary.length} [id ${stop.id}] alle ${stop.time}: ${describeDetails(place)}`);
    }

    if (added.length) {
      this.candidates = [];
      // Candidates shown earlier in this turn are consumed by the choice; do not resurface them.
      this.actions = this.actions.filter((action) => action.type !== 'show_candidates');
      this.actions.push({ type: 'add_stops', stops: added });
    }
    return { content: notes.join('\n'), isError: !added.length };
  }

  private async placeDetails(input: Record<string, unknown>): Promise<ToolOutcome> {
    const placeId = typeof input.place === 'string' ? this.resolvePlaceId(input.place) : null;
    if (!placeId) return { isError: true, content: 'Luogo non riconosciuto.' };
    try {
      return { content: describeDetails(await getPlaceDetails(placeId)) };
    } catch (error) {
      return failure(error);
    }
  }

  private removeStops(input: Record<string, unknown>): ToolOutcome {
    const ids = stringList(input.stop_ids, MAX_STOPS);
    const removed = this.itinerary.filter((stop) => ids.includes(stop.id));
    if (!removed.length) return { isError: true, content: 'Nessuna tappa corrisponde agli id indicati.' };
    this.itinerary = this.itinerary.filter((stop) => !ids.includes(stop.id));
    this.actions.push({ type: 'remove_stops', stopIds: removed.map((stop) => stop.id) });
    return { content: `Rimosse: ${removed.map((stop) => stop.title).join(', ')}. Restano ${this.itinerary.length} tappe.` };
  }

  private shiftTimes(input: Record<string, unknown>): ToolOutcome {
    const minutes = typeof input.minutes === 'number' ? Math.round(input.minutes) : 0;
    if (!minutes) return { isError: true, content: 'Indica di quanti minuti spostare gli orari.' };
    this.itinerary = this.itinerary.map((stop) => ({ ...stop, time: shiftTime(stop.time, minutes) }));
    this.actions.push({ type: 'shift_times', minutes });
    return { content: `Orari spostati di ${minutes} minuti.` };
  }

  private updateProfile(input: Record<string, unknown>): ToolOutcome {
    const patch: ProfilePatch = {};
    if (typeof input.slow_pace === 'boolean') patch.slowPace = input.slow_pace;
    if (typeof input.avoid_queues === 'boolean') patch.avoidQueues = input.avoid_queues;
    if (typeof input.no_fish === 'boolean') patch.noFish = input.no_fish;
    if (typeof input.markets === 'boolean') patch.markets = input.markets;

    const entries = (value: unknown) => (Array.isArray(value) ? value : [])
      .map((item) => asRecord(item))
      .filter((item): item is { category: PreferenceCategory; value: string } =>
        typeof item.category === 'string'
        && (preferenceCategories as readonly string[]).includes(item.category)
        && typeof item.value === 'string'
        && item.value.trim().length > 0)
      .map((item) => ({ category: item.category, value: item.value.trim().slice(0, 60) }))
      .slice(0, 6);

    const learn = entries(input.learn);
    const forget = entries(input.forget);
    if (learn.length) patch.learn = learn;
    if (forget.length) patch.forget = forget;

    if (!Object.keys(patch).length) return { isError: true, content: 'Nessuna preferenza valida da salvare.' };
    this.actions.push({ type: 'update_profile', patch });
    return { content: 'Profilo aggiornato.' };
  }
}
