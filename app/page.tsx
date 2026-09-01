'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  CloudRain,
  ExternalLink,
  LogIn,
  LogOut,
  LocateFixed,
  MapPin,
  Mic,
  Move,
  Navigation,
  Route,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Umbrella,
  UserRound,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { MapPicker } from '@/components/map-picker';
import { useAuth0 } from '@/hooks/use-auth0';
import {
  createEmptyProfile,
  normalizeProfile,
  type PreferenceCategory,
  type Profile,
} from '@/lib/profile';

type Message = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  meta?: string;
};

type Stop = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: 'place' | 'coffee' | 'walk';
  placeId?: string;
  primaryType?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googleMapsUri?: string | null;
  source?: 'google_places';
};

type PlaceCandidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
  businessStatus: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  distanceMeters: number;
  tripadvisor: {
    locationId: string;
    rating: number;
    reviewCount: number;
    ratingImageUrl: string;
    webUrl: string;
  } | null;
};

type ManualPreferenceKey = 'avoidQueues' | 'markets' | 'noFish' | 'slowPace';

type PendingSearch = {
  kind: PreferenceCategory;
  origin: { lat: number; lng: number };
  openNow: boolean;
};

type SearchRequest = Pick<PendingSearch, 'kind' | 'openNow'>;

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Sei nel centro di Milano. Dimmi quanto tempo hai: terrò insieme meteo, distanze e ciò che preferisci.',
    meta: 'Posizione e meteo aggiornati ora',
  },
];

const PROFILE_STORAGE_KEY = 'cicero-profile-v2';

const preferenceCategoryLabels: Record<PreferenceCategory, string> = {
  cafe: 'Caffè',
  evening: 'Serata',
  museum: 'Musei',
  restaurant: 'Ristoranti',
  shopping: 'Shopping',
};

const emptyPlan: Stop[] = [];

function distanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadius = 6371000;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function humanDistance(value: number) {
  return value < 1000 ? `${Math.max(10, Math.round(value / 10) * 10)} m` : `${(value / 1000).toFixed(1).replace('.', ',')} km`;
}

function humanReviewCount(value: number) {
  return new Intl.NumberFormat('it-IT', { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value);
}

function googleMapsRouteUrl(origin: { lat: number; lng: number }, stops: Stop[]) {
  if (!stops.length) return null;
  const stopLocations = stops.map((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    ? `${stop.lat},${stop.lng}`
    : stop.address || stop.title);
  const destination = stopLocations.at(-1);
  if (!destination) return null;

  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination,
    travelmode: 'walking',
  });
  const lastStop = stops.at(-1);
  if (lastStop?.placeId) params.set('destination_place_id', lastStop.placeId);
  if (stopLocations.length > 1) params.set('waypoints', stopLocations.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function itineraryDistance(origin: { lat: number; lng: number }, stops: Stop[]) {
  let previous = origin;
  let total = 0;
  for (const stop of stops) {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return null;
    const next = { lat: stop.lat!, lng: stop.lng! };
    total += distanceMeters(previous, next);
    previous = next;
  }
  return total;
}

function nextStopTime(index: number) {
  const date = new Date(Date.now() + (15 + index * 45) * 60_000);
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function priceLabel(value: string | null) {
  return ({
    PRICE_LEVEL_FREE: 'gratis',
    PRICE_LEVEL_INEXPENSIVE: '€',
    PRICE_LEVEL_MODERATE: '€€',
    PRICE_LEVEL_EXPENSIVE: '€€€',
    PRICE_LEVEL_VERY_EXPENSIVE: '€€€€',
  } as Record<string, string>)[value || ''] || null;
}

function shiftTime(value: string, minutes: number) {
  const [hours, mins] = value.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isNoPreferenceAnswer(value: string) {
  return /^(nessuna|nessuna preferenza|non ho preferenze|indifferente|fai tu|qualsiasi|sorprendimi)$/i.test(value.trim());
}

function isAffirmingPreferenceAnswer(value: string) {
  return /^(sì|si|va bene|confermo|come sempre|le stesse|gli stessi|tienile|tienili)$/i.test(value.trim());
}

function firstTextIndex(value: string, terms: string[]) {
  return terms.reduce((closest, term) => {
    const index = value.indexOf(term);
    return index >= 0 && (closest < 0 || index < closest) ? index : closest;
  }, -1);
}

function extractSearchRequests(value: string): SearchRequest[] {
  const foodPreferenceOnly = /(non mangio|non posso mangiare|evita|senza).{0,12}pesce/.test(value)
    && !value.includes('ristor')
    && !value.includes('pranzo')
    && !/\bcena\b/.test(value);
  const restaurantIndex = foodPreferenceOnly ? -1 : firstTextIndex(value, ['ristor', 'pranzo', 'mang', 'cena']);
  const cafeIndex = firstTextIndex(value, ['caff']);
  const museumIndex = firstTextIndex(value, ['muse', 'mostra', 'arte']);
  const shoppingIndex = firstTextIndex(value, ['shopping', 'negoz', 'boutique', 'acquist', 'comprare', 'outlet', 'centro commerciale', 'vintage']);
  const explicitEveningIndex = firstTextIndex(value, ['dopocena', 'dopo cena', 'intratten', 'musica dal vivo', 'concerto', 'teatro', 'cocktail', 'discoteca', 'ballare']);
  const genericEveningIndex = restaurantIndex < 0 ? firstTextIndex(value, ['serata', 'stasera']) : -1;
  const eveningIndex = explicitEveningIndex >= 0 ? explicitEveningIndex : genericEveningIndex;

  return [
    { kind: 'restaurant' as const, index: restaurantIndex, openNow: !/(cena|stasera|domani)/.test(value) },
    { kind: 'cafe' as const, index: cafeIndex, openNow: true },
    { kind: 'museum' as const, index: museumIndex, openNow: true },
    { kind: 'shopping' as const, index: shoppingIndex, openNow: !/\b(domani|stasera)\b/.test(value) },
    { kind: 'evening' as const, index: eveningIndex, openNow: false },
  ]
    .filter((request) => request.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ kind, openNow }) => ({ kind, openNow }));
}

export default function Home() {
  const {
    status: authStatus,
    user: authUser,
    login: loginWithAuth0,
    logout: logoutFromAuth0,
    getAccessToken,
  } = useAuth0();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [itinerary, setItinerary] = useState<Stop[]>(emptyPlan);
  const [placeCandidates, setPlaceCandidates] = useState<PlaceCandidate[]>([]);
  const [placesMode, setPlacesMode] = useState<'unknown' | 'ready' | 'missing' | 'error'>('unknown');
  const [selectingPlace, setSelectingPlace] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState<PendingSearch | null>(null);
  const [searchQueue, setSearchQueue] = useState<SearchRequest[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [city, setCity] = useState('Milano');
  const [cityInput, setCityInput] = useState('Milano');
  const [addressInput, setAddressInput] = useState('');
  const [locationLabel, setLocationLabel] = useState('Centro');
  const [coords, setCoords] = useState({ lat: 45.4642, lng: 9.19 });
  const [weather, setWeather] = useState('meteo in arrivo');
  const [profile, setProfile] = useState<Profile>(() => createEmptyProfile());
  const [profileReady, setProfileReady] = useState(false);
  const [profileStatus, setProfileStatus] = useState<'error' | 'loading' | 'saved' | 'saving' | 'signed-out' | 'unconfigured'>('loading');
  const [profileOpen, setProfileOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [routeFocusToken, setRouteFocusToken] = useState(0);
  const nextId = useRef(2);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const lastPersistedProfile = useRef<string | null>(null);
  const profileSyncEnabled = useRef(false);
  const activePreferenceCount = [profile.slowPace, profile.avoidQueues].filter(Boolean).length
    + Object.values(profile.learned).reduce((total, values) => total + values.length, 0);
  const profileEditable = profileReady
    && (authStatus === 'authenticated' || authStatus === 'unconfigured')
    && profileStatus !== 'signed-out';
  const profileDisplayName = authUser?.name || authUser?.nickname || authUser?.email || 'Il tuo profilo';
  const profileInitials = authStatus === 'authenticated'
    ? profileDisplayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : '';
  const profileStatusLabel = profileStatus === 'saved'
    ? 'Sincronizzato con il tuo profilo'
    : profileStatus === 'saving'
      ? 'Salvataggio sul profilo…'
      : profileStatus === 'loading'
        ? 'Carico il tuo profilo…'
        : profileStatus === 'signed-out'
          ? 'Accedi per sincronizzare le preferenze'
          : profileStatus === 'unconfigured'
            ? 'Auth0 deve ancora essere collegato'
            : 'Preferenze non sincronizzate';
  const routeDistance = itineraryDistance(coords, itinerary);
  const googleMapsUrl = googleMapsRouteUrl(coords, itinerary);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    profileSyncEnabled.current = false;
    lastPersistedProfile.current = null;

    if (authStatus === 'loading') {
      setProfileStatus('loading');
      setProfileReady(false);
      return () => { active = false; };
    }
    if (authStatus === 'error') {
      setProfileStatus('error');
      setProfileReady(true);
      return () => { active = false; };
    }
    if (authStatus === 'anonymous') {
      setProfileStatus('signed-out');
      setProfileReady(true);
      return () => { active = false; };
    }

    async function loadProfile() {
      try {
        const token = authStatus === 'authenticated' ? await getAccessToken() : null;
        if (authStatus === 'authenticated' && !token) {
          if (active) setProfileStatus('signed-out');
          return;
        }
        const response = await fetch('/api/profile/preferences', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (response.status === 401) {
          if (!active) return;
          setProfileStatus('signed-out');
          setProfileReady(true);
          return;
        }
        if (!response.ok) throw new Error('profile unavailable');

        const data = await response.json() as { profile?: unknown; exists?: boolean };
        let nextProfile = normalizeProfile(data.profile);
        const localProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY);

        if (!data.exists && localProfile) {
          try {
            nextProfile = normalizeProfile(JSON.parse(localProfile));
          } catch { /* an invalid legacy profile is ignored */ }
        }

        if (!active) return;
        profileSyncEnabled.current = true;
        lastPersistedProfile.current = data.exists ? JSON.stringify(nextProfile) : null;
        setProfile(nextProfile);
        setProfileReady(true);
        setProfileStatus(data.exists ? 'saved' : 'saving');
        if (data.exists) window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch {
        if (!active) return;
        setProfileStatus('error');
        setProfileReady(true);
      }
    }

    void loadProfile();
    return () => { active = false; };
  }, [authStatus, getAccessToken]);

  useEffect(() => {
    if (!profileReady || !profileSyncEnabled.current) return;

    const serialized = JSON.stringify(profile);
    if (serialized === lastPersistedProfile.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setProfileStatus('saving');
      try {
        const token = authStatus === 'authenticated' ? await getAccessToken() : null;
        if (authStatus === 'authenticated' && !token) {
          profileSyncEnabled.current = false;
          setProfileStatus('signed-out');
          return;
        }
        const response = await fetch('/api/profile/preferences', {
          method: 'PUT',
          headers: token
            ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' },
          body: serialized,
          signal: controller.signal,
        });
        if (response.status === 401) {
          profileSyncEnabled.current = false;
          setProfileStatus('signed-out');
          return;
        }
        if (!response.ok) throw new Error('profile save failed');

        const data = await response.json() as { profile?: unknown };
        lastPersistedProfile.current = JSON.stringify(normalizeProfile(data.profile));
        window.localStorage.removeItem(PROFILE_STORAGE_KEY);
        setProfileStatus('saved');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setProfileStatus('error');
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authStatus, getAccessToken, profile, profileReady]);

  useEffect(() => {
    const controller = new AbortController();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,precipitation&hourly=precipitation_probability&forecast_hours=6&timezone=auto`;
    fetch(url, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        const temp = Math.round(data.current?.temperature_2m ?? 0);
        const rainNow = Number(data.current?.precipitation ?? 0);
        const peak = Math.max(...(data.hourly?.precipitation_probability ?? [0]));
        setWeather(rainNow > 0 ? `${temp}° · piove ora` : `${temp}° · pioggia ${peak}%`);
      })
      .catch(() => setWeather('meteo non disponibile'));
    return () => controller.abort();
  }, [coords]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, thinking, placeCandidates]);

  function append(role: Message['role'], text: string, meta?: string) {
    const item: Message = { id: nextId.current++, role, text, meta };
    setMessages((current) => [...current, item]);
  }

  function reply(text: string, meta?: string, delay = 520) {
    setThinking(true);
    window.setTimeout(() => {
      append('assistant', text, meta);
      setThinking(false);
    }, delay);
  }

  async function searchPlaces(query: string, origin = coords, openNow = true) {
    setThinking(true);
    setPlaceCandidates([]);
    try {
      const response = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          lat: origin.lat,
          lng: origin.lng,
          radiusMeters: 1200,
          openNow,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'PLACES_NOT_CONFIGURED') {
          setPlacesMode('missing');
          append('assistant', 'Il collegamento con Google Places è pronto, ma manca ancora la chiave server. Finché non è attiva non invento nessun luogo.', 'Nessun POI generato');
          return;
        }
        setPlacesMode('error');
        append('assistant', 'Google Places non risponde correttamente in questo momento. Non aggiungo tappe non verificate.', 'Ricerca non riuscita');
        return;
      }

      setPlacesMode('ready');
      const candidates = (data.places || []).map((place: Omit<PlaceCandidate, 'distanceMeters'>) => ({
        ...place,
        distanceMeters: distanceMeters(origin, place),
      }));
      setPlaceCandidates(candidates);
      append(
        'assistant',
        candidates.length
          ? `Ho trovato ${candidates.length} opzioni vicino al punto scelto che seguono le tue indicazioni. Quale vuoi aggiungere?`
          : openNow
            ? 'Non trovo luoghi aperti adatti vicino al punto scelto. Non aggiungo alternative inventate.'
            : 'Non trovo luoghi adatti vicino al punto scelto. Non aggiungo alternative inventate.',
        'Ricerca Google Places completata',
      );
    } catch {
      setPlacesMode('error');
      append('assistant', 'Non riesco a raggiungere Places. Il tuo itinerario resta invariato.', 'Errore di connessione');
    } finally {
      setThinking(false);
    }
  }

  async function addPlace(candidate: PlaceCandidate) {
    setSelectingPlace(candidate.id);
    try {
      const response = await fetch(`/api/places/details?id=${encodeURIComponent(candidate.id)}`);
      const data = await response.json();
      if (!response.ok || !data.place) throw new Error('details unavailable');

      const place = data.place;
      const openLabel = place.openNow === true ? 'aperto ora' : place.openNow === false ? 'chiuso ora' : 'orario non confermato';
      const price = priceLabel(place.priceLevel);
      const rating = typeof place.rating === 'number' ? `${place.rating.toFixed(1)} (${place.userRatingCount || 0})` : null;
      const detail = [humanDistance(candidate.distanceMeters), openLabel, price, rating].filter(Boolean).join(' · ');
      const stop: Stop = {
        id: candidate.id,
        placeId: candidate.id,
        time: nextStopTime(itinerary.length),
        title: place.name,
        detail,
        kind: candidate.primaryType === 'cafe' || candidate.primaryType === 'coffee_shop' ? 'coffee' : 'place',
        primaryType: candidate.primaryType,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        googleMapsUri: place.googleMapsUri,
        source: 'google_places',
      };

      setItinerary((current) => current.some((item) => item.placeId === candidate.id) ? current : [...current, stop]);
      setPlaceCandidates([]);
      append('assistant', `Ho aggiunto ${place.name} senza modificare le altre tappe. Orari e stato sono stati ricontrollati adesso.`, 'Itinerario aggiornato con Place ID');

      const nextRequest = searchQueue[0];
      if (nextRequest) {
        setSearchQueue((current) => current.slice(1));
        askForSearchDetails(nextRequest.kind, { lat: place.lat, lng: place.lng }, nextRequest.openNow);
      }
    } catch {
      append('assistant', `Non riesco a verificare i dettagli di ${candidate.name}; non l’ho aggiunto.`, 'Itinerario invariato');
    } finally {
      setSelectingPlace(null);
    }
  }

  function startSearchFlow(requests: SearchRequest[], origin = coords) {
    const [first, ...rest] = requests;
    if (!first) return;
    setSearchQueue(rest);
    askForSearchDetails(first.kind, origin, first.openNow);
  }

  function handlePrompt(prompt: string) {
    if (thinking) return;
    setPendingSearch(null);
    setSearchQueue([]);
    append('user', prompt);

    if (prompt === 'Cosa faccio adesso?') {
      void searchPlaces('luoghi interessanti da visitare');
      return;
    }

    if (prompt === 'Ritmo tranquillo') {
      setProfile((current) => ({ ...current, slowPace: true }));
      reply('Memorizzato: ritmo tranquillo. Da ora riduco le tappe e aggiungo più margine tra una e l’altra.', 'Salvato nel tuo profilo');
      return;
    }

    void searchPlaces('musei e attività al coperto');
  }

  function rememberPreference(kind: PreferenceCategory, answer: string) {
    const value = answer.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!value || isNoPreferenceAnswer(value) || isAffirmingPreferenceAnswer(value)) return;

    setProfile((current) => {
      const previous = current.learned[kind];
      const withoutDuplicate = previous.filter((item) => item.toLocaleLowerCase('it') !== value.toLocaleLowerCase('it'));
      return {
        ...current,
        learned: {
          ...current.learned,
          [kind]: [value, ...withoutDuplicate].slice(0, 4),
        },
      };
    });
  }

  function forgetPreference(kind: PreferenceCategory, value: string) {
    setProfile((current) => ({
      ...current,
      learned: {
        ...current.learned,
        [kind]: current.learned[kind].filter((item) => item !== value),
      },
    }));
  }

  function baseSearchQuery(kind: PreferenceCategory) {
    return kind === 'restaurant'
      ? 'ristorante'
      : kind === 'museum'
        ? 'museo'
        : kind === 'shopping'
          ? 'negozi'
          : kind === 'evening'
            ? 'intrattenimento serale'
            : 'caffè';
  }

  function savedSearchPreferences(kind: PreferenceCategory) {
    const saved = [...profile.learned[kind]];
    if (kind === 'restaurant' && profile.noFish) saved.push('senza pesce');
    if (kind === 'shopping' && profile.markets) saved.push('mercato locale');
    return saved.filter((value, index, values) => values.indexOf(value) === index);
  }

  function rememberProfileSignals(message: string) {
    const signals: string[] = [];
    const updates: Partial<Pick<Profile, 'avoidQueues' | 'markets' | 'noFish' | 'slowPace'>> = {};

    if (/(non mangio|non posso mangiare|evita|senza).{0,12}pesce/.test(message)) {
      updates.noFish = true;
      signals.push('niente pesce');
    }
    if (/(odio|evita|evitare|non sopporto).{0,16}(code|fila)/.test(message)) {
      updates.avoidQueues = true;
      signals.push('evitare le code');
    }
    if (/(ritmo tranquillo|senza fretta|andare piano|camminare poco)/.test(message)) {
      updates.slowPace = true;
      signals.push('ritmo tranquillo');
    }
    if (/(mi piacciono|adoro|amo|preferisco).{0,20}mercat/.test(message)) {
      updates.markets = true;
      signals.push('preferenza per i mercati');
    }

    if (signals.length) setProfile((current) => ({ ...current, ...updates }));
    return signals;
  }

  function askForSearchDetails(kind: PendingSearch['kind'], origin = coords, openNow = true) {
    const saved = savedSearchPreferences(kind);

    if (saved.length) {
      const context = kind === 'restaurant'
        ? 'Per mangiare'
        : kind === 'museum'
          ? 'Per i musei'
          : kind === 'shopping'
            ? 'Per lo shopping'
          : kind === 'evening'
            ? 'Per la sera'
            : 'Per una pausa caffè';
      setPendingSearch(null);
      append('assistant', `${context} uso direttamente le tue preferenze: ${saved.join(', ')}.`, 'Preferenze applicate dal tuo profilo');
      void searchPlaces([baseSearchQuery(kind), ...saved].join(' '), origin, openNow);
      return;
    }

    setPendingSearch({ kind, origin, openNow });

    if (kind === 'restaurant') {
      reply(
        profile.noFish
          ? 'Che tipo di cucina ti va? Tengo già fuori il pesce; dimmi pure se hai altre preferenze alimentari.'
          : 'Che tipo di cucina ti va? Dimmi anche se hai preferenze o esigenze alimentari.',
        profile.noFish ? 'Pesce escluso dal tuo profilo' : 'Una risposta, poi cerco qui vicino',
      );
      return;
    }

    if (kind === 'museum') {
      reply('Che cosa ti interessa di più: arte, design, storia o scienza?', 'Una risposta, poi cerco qui vicino');
      return;
    }

    if (kind === 'shopping') {
      reply(
        profile.markets
          ? 'Ricordo che ti piacciono i mercati: li tengo come priorità o preferisci moda, design, vintage, lusso o un centro commerciale?'
          : 'Che tipo di shopping cerchi: moda, design, vintage, lusso, mercati o un centro commerciale?',
        'Una risposta, poi cerco negozi qui vicino',
      );
      return;
    }

    if (kind === 'evening') {
      reply('Che tipo di serata cerchi: musica dal vivo, teatro, un cocktail tranquillo o un posto dove ballare?', 'Cerco per la sera, non solo tra i posti aperti ora');
      return;
    }

    reply('Che tipo di pausa cerchi: un espresso veloce, colazione o un posto tranquillo dove sederti?', 'Una risposta, poi cerco qui vicino');
  }

  function refinedSearchQuery(search: PendingSearch, answer: string) {
    const remembered = profile.learned[search.kind];
    const detail = isNoPreferenceAnswer(answer)
      ? ''
      : isAffirmingPreferenceAnswer(answer)
        ? remembered.join(' ')
        : answer.trim();
    const dietaryPreference = search.kind === 'restaurant' && profile.noFish ? 'senza pesce' : '';
    const marketPreference = search.kind === 'shopping'
      && profile.markets
      && (isNoPreferenceAnswer(answer) || isAffirmingPreferenceAnswer(answer))
      ? 'mercato locale'
      : '';
    return [baseSearchQuery(search.kind), detail, dietaryPreference, marketPreference].filter(Boolean).join(' ');
  }

  function interpretMessage(value: string) {
    const normalized = value.toLocaleLowerCase('it');
    append('user', value);
    const learnedSignals = rememberProfileSignals(normalized);

    if (pendingSearch) {
      if (/^(annulla|lascia stare|non importa)$/i.test(value.trim())) {
        setPendingSearch(null);
        setSearchQueue([]);
        reply('Va bene, lasciamo perdere questa ricerca. Dimmi pure cosa vuoi fare invece.');
        return;
      }

      const search = pendingSearch;
      setPendingSearch(null);
      rememberPreference(search.kind, value);
      void searchPlaces(refinedSearchQuery(search, value), search.origin, search.openNow);
      return;
    }

    const searchRequests = extractSearchRequests(normalized);

    if (normalized.includes('togli') || normalized.includes('rimuovi')) {
      setItinerary((current) => {
        const museumIndex = normalized.includes('muse') ? current.findIndex((stop) => stop.primaryType?.includes('museum')) : -1;
        const index = museumIndex >= 0 ? museumIndex : current.length - 1;
        return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current;
      });
      reply('Fatto: ho rimosso solo la tappa indicata. Il resto rimane com’era.', 'Itinerario aggiornato, non rigenerato');
      return;
    }

    if (searchRequests.length) {
      const initialOrigin = searchRequests[0].kind === 'cafe'
        && normalized.includes('second')
        && itinerary[1]?.lat != null
        && itinerary[1]?.lng != null
        ? { lat: itinerary[1].lat!, lng: itinerary[1].lng! }
        : coords;
      startSearchFlow(searchRequests, initialOrigin);
      return;
    }

    if (normalized.includes('ora') || normalized.includes('60 minut')) {
      setItinerary((current) => current.map((stop) => ({ ...stop, time: shiftTime(stop.time, 60) })));
      reply('Spostato tutto avanti di un’ora, mantenendo distanze e ordine delle tappe.', 'Orari aggiornati');
      return;
    }

    if (learnedSignals.length) {
      reply(`Me lo ricorderò: ${learnedSignals.join(', ')}. Da ora lo considero nelle proposte.`, 'Profilo aggiornato dalla conversazione');
      return;
    }

    reply(
      itinerary.length
        ? 'Certo. Posso aggiungere una tappa vicino al percorso, sostituirne una o sistemare gli orari. Cosa vuoi cambiare?'
        : `Dimmi cosa ti piacerebbe fare e quanto tempo hai: parto da ${locationLabel} e cerco qualcosa di adatto qui vicino.`,
      itinerary.length ? `${itinerary.length} tappe nel percorso` : `${city} · partenza da ${locationLabel}`,
    );
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || thinking) return;
    setInput('');
    interpretMessage(value);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      reply('Questo browser non condivide la posizione. Puoi indicarmi una città dal chip in alto.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setCity('Qui vicino');
        setLocationLabel('posizione attuale');
        setLocating(false);
        append('assistant', 'Posizione aggiornata. Prima di proporti una tappa controllerò raggio, apertura e meteo.', 'GPS aggiornato ora');
      },
      () => {
        setLocating(false);
        reply('Non riesco ad accedere al GPS. Puoi indicarmi una città dal chip in alto.');
      },
      { enableHighAccuracy: true, timeout: 9000 },
    );
  }

  async function findLocation(query: string, closeSheet = false) {
    if (!query) return;
    setLocating(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`);
      const [result] = await response.json();
      if (!result) throw new Error('not found');
      setCoords({ lat: Number(result.lat), lng: Number(result.lon) });
      const nextCity = result.address?.city || result.address?.town || result.address?.municipality || city;
      const nextLabel = result.display_name?.split(',')[0] || query;
      setCity(nextCity);
      setLocationLabel(nextLabel);
      setAddressInput(nextLabel);
      if (closeSheet) setLocationOpen(false);
      append('assistant', `Ho spostato il punto di partenza su ${nextLabel}. Le tappe esistenti restano intatte.`, 'Pin e contesto aggiornati');
    } catch {
      if (closeSheet) setLocationOpen(false);
      reply(`Non trovo “${query}” con sufficiente certezza. Prova con città e Paese.`);
    } finally {
      setLocating(false);
    }
  }

  function changeCity(event: FormEvent) {
    event.preventDefault();
    void findLocation(cityInput.trim(), true);
  }

  function searchAddress(event: FormEvent) {
    event.preventDefault();
    void findLocation(addressInput.trim());
  }

  async function movePin(next: { lat: number; lng: number }) {
    setCoords(next);
    setLocationLabel('pin spostato');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${next.lat}&lon=${next.lng}`);
      const result = await response.json();
      const nextLabel = result.name || result.address?.road || result.address?.pedestrian || result.address?.neighbourhood || 'pin spostato';
      const nextCity = result.address?.city || result.address?.town || result.address?.municipality;
      setLocationLabel(nextLabel);
      setAddressInput(nextLabel);
      if (nextCity) setCity(nextCity);
      append('assistant', `Partiamo da ${nextLabel}. Ho lasciato le tappe intatte; tempi e distanze useranno questo nuovo punto.`, 'Pin spostato sulla mappa');
    } catch {
      append('assistant', 'Ho aggiornato il punto di partenza alle coordinate del pin. L’indirizzo non è disponibile.', 'Coordinate aggiornate');
    }
  }

  function toggleProfile(key: ManualPreferenceKey) {
    setProfile((current) => ({ ...current, [key]: !current[key] }));
  }

  function removeItineraryStop(stopId: string) {
    setItinerary((current) => current.filter((stop) => stop.id !== stopId));
  }

  return (
    <main className={`app-shell ${mapOpen ? '' : 'map-collapsed'}`}>
      <section className={`map-stage ${itinerary.length ? 'has-route' : ''} ${placeCandidates.length ? 'has-candidates' : ''}`} aria-label="Mappa dell’itinerario">
        <MapPicker
          coords={coords}
          onChange={movePin}
          stops={itinerary}
          candidates={placeCandidates}
          onSelectCandidate={(candidateId) => {
            const candidate = placeCandidates.find((place) => place.id === candidateId);
            if (candidate && selectingPlace === null) void addPlace(candidate);
          }}
          focusToken={routeFocusToken}
        />
        <div className="map-wash" aria-hidden="true" />

        <header className="topbar">
          <a className="brand" href="#" aria-label="Cicero, home">
            <span className="brand-mark"><Navigation /></span>
            <span>Cicero</span>
          </a>
          <Button className="profile-button" variant="outline" size="icon" aria-label="Apri il profilo" onClick={() => setProfileOpen(true)}>
            {profileInitials || <UserRound />}
          </Button>
        </header>

        <div className="context-strip" aria-label="Contesto attuale">
          <button className="context-button" type="button" onClick={() => setLocationOpen(true)}>
            <MapPin /> {city} · {locationLabel} <ChevronRight />
          </button>
          <Badge className="context-pill weather" variant="secondary">
            {weather.includes('piove') ? <CloudRain /> : <Sun />} {weather}
          </Badge>
        </div>

        <form className="map-search" onSubmit={searchAddress}>
          <Search aria-hidden="true" />
          <Input
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            placeholder="Inserisci posizione o indirizzo"
            aria-label="Posizione o indirizzo"
            enterKeyHint="search"
          />
          <Button type="submit" size="icon" aria-label="Cerca sulla mappa" disabled={!addressInput.trim() || locating}>
            {locating ? <LocateFixed className="spin" /> : <ChevronRight />}
          </Button>
          <span className="map-search-hint"><Move /> Tieni premuto e trascina il pin</span>
        </form>

        {placeCandidates.length > 0 ? (
          <div className="candidate-map-summary">
            <MapPin />
            <div><strong>{placeCandidates.length} proposte sulla mappa</strong><span>Tocca un pin oppure scegli dall’elenco</span></div>
          </div>
        ) : itinerary.length > 0 && (
          <button
            className="route-summary"
            type="button"
            onClick={() => {
              setRouteFocusToken((value) => value + 1);
              setRouteOpen(true);
            }}
            aria-label="Apri il riepilogo del percorso"
          >
            <span className="route-summary-icon"><Route /></span>
            <span className="route-summary-copy">
              <small>Il tuo percorso</small>
              <strong>Partenza + {itinerary.length} {itinerary.length === 1 ? 'tappa' : 'tappe'}</strong>
              <span>Segui i numeri sulla mappa</span>
            </span>
            <span className="route-steps" aria-hidden="true">
              <i className="route-step-origin"><MapPin /></i>
              {itinerary.slice(0, 3).map((stop, index) => <i key={stop.id}>{index + 1}</i>)}
              {itinerary.length > 3 && <em>+{itinerary.length - 3}</em>}
            </span>
          </button>
        )}

        <Button className="locate-button" variant="outline" size="icon-lg" aria-label="Usa la mia posizione" onClick={useCurrentLocation} disabled={locating}>
          <LocateFixed className={locating ? 'spin' : ''} />
        </Button>
      </section>

      <section className="conversation" aria-label="Conversazione con Cicero">
        <button className="drag-handle-button" type="button" onClick={() => setMapOpen((value) => !value)} aria-label={mapOpen ? 'Espandi la conversazione' : 'Mostra la mappa'}>
          <span className="drag-handle" />
        </button>
        <div className="conversation-head">
          <div>
            <p className="eyebrow">Oggi a {city}</p>
            <h1>{itinerary.length ? 'Il tuo percorso, mentre ne parliamo.' : 'Parliamo. Al percorso penso io.'}</h1>
          </div>
          <Button className="memory-button" variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
            <SlidersHorizontal /> {activePreferenceCount} preferenze
          </Button>
        </div>

        <div className="messages" aria-live="polite">
          {messages.map((message) => (
            <article className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`} key={message.id}>
              {message.role === 'assistant' && <span className="assistant-avatar"><Sparkles /></span>}
              <div className="message-content">
                <p>{message.text}</p>
                {message.meta && <span className="trust-note"><Check /> {message.meta}</span>}
              </div>
            </article>
          ))}

          {placeCandidates.length > 0 && (
            <article className="places-card" aria-label="Luoghi verificati e recensioni disponibili">
              <div className="places-card-head">
                <div><span>Vicino al punto scelto</span><strong>Scegli una tappa</strong></div>
                <Badge variant="outline">live</Badge>
              </div>
              <div className="place-options">
                {placeCandidates.map((place, index) => (
                  <div className="place-option" key={place.id}>
                    <button type="button" onClick={() => void addPlace(place)} disabled={selectingPlace !== null}>
                      <span className="place-map-index" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                      <span className="place-option-copy">
                        <strong>{place.name}</strong>
                        <small>{humanDistance(place.distanceMeters)} · {place.address}</small>
                        <span className="place-review-summary">
                          {place.rating != null && place.userRatingCount != null && (
                            <span className="google-review">★ {place.rating.toFixed(1).replace('.', ',')} · {humanReviewCount(place.userRatingCount)} su Google</span>
                          )}
                          {place.tripadvisor && (
                            <span className="tripadvisor-review">
                              <img src={place.tripadvisor.ratingImageUrl} alt={`Tripadvisor ${place.tripadvisor.rating.toFixed(1).replace('.', ',')} su 5`} />
                              <span>{humanReviewCount(place.tripadvisor.reviewCount)} recensioni</span>
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="place-add">{selectingPlace === place.id ? <LocateFixed className="spin" /> : '+'}</span>
                    </button>
                    <span className="place-source-links">
                      {place.googleMapsUri && (
                        <a href={place.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri ${place.name} su Google Maps`}>
                          <ExternalLink />
                        </a>
                      )}
                      {place.tripadvisor && (
                        <a href={place.tripadvisor.webUrl} target="_blank" rel="noreferrer" aria-label={`Leggi le recensioni di ${place.name} su Tripadvisor`}>
                          Trip
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="google-attribution">
                Dati luogo forniti da <strong>Google Maps</strong>
                {placeCandidates.some((place) => place.tripadvisor) && <> · valutazioni <strong>Tripadvisor</strong></>}
              </p>
            </article>
          )}

          {itinerary.length > 0 && (
            <article className="itinerary-card" aria-label="Itinerario corrente">
              <div className="itinerary-title">
                <div><span>Tappe del percorso</span><strong>{itinerary.length} tappe in ordine · circa 2 ore</strong></div>
                <Badge variant="outline">{itinerary.some((stop) => stop.source === 'google_places') ? 'live' : 'demo'}</Badge>
              </div>
              <ol>
                {itinerary.map((stop, index) => (
                  <li key={stop.id}>
                    <time>{stop.time}</time>
                    <span className="stop-icon">{index + 1}</span>
                    <div>
                      {stop.googleMapsUri ? <a href={stop.googleMapsUri} target="_blank" rel="noreferrer"><strong>{stop.title}</strong><ExternalLink /></a> : <strong>{stop.title}</strong>}
                      <span>{stop.detail}</span>
                    </div>
                    <Button className="stop-remove" type="button" variant="ghost" size="icon" onClick={() => removeItineraryStop(stop.id)} aria-label={`Rimuovi ${stop.title} dall’itinerario`} title={`Rimuovi ${stop.title}`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
              {itinerary.some((stop) => stop.source === 'google_places') ? (
                <p className="google-attribution itinerary-attribution">Dati luogo forniti da <strong>Google Maps</strong> · verificati all’inserimento</p>
              ) : (
                <p className="data-warning"><Umbrella /> I nomi reali appariranno solo dopo la verifica con Places.</p>
              )}
            </article>
          )}

          {thinking && (
            <article className="message assistant-message thinking-message">
              <span className="assistant-avatar"><Sparkles /></span>
              <div className="thinking-dots"><i /><i /><i /></div>
            </article>
          )}
          <div ref={messagesEnd} />
        </div>

        <div className="quick-prompts" aria-label="Suggerimenti rapidi">
          <button type="button" onClick={() => handlePrompt('Cosa faccio adesso?')}>Cosa faccio adesso?</button>
          <button type="button" onClick={() => { setSearchQueue([]); append('user', 'Trova un caffè qui vicino'); askForSearchDetails('cafe'); }}>Caffè qui vicino</button>
          <button type="button" onClick={() => { setSearchQueue([]); append('user', 'Vorrei fare shopping'); askForSearchDetails('shopping'); }}>Shopping</button>
          <button type="button" onClick={() => handlePrompt('Ritmo tranquillo')}>Ritmo tranquillo</button>
          <button type="button" onClick={() => handlePrompt('Evita la pioggia')}>Evita la pioggia</button>
        </div>

        <form className="composer" onSubmit={submitMessage}>
          <Button className="mic-button" type="button" variant="ghost" size="icon-lg" aria-label="Parla con Cicero" onClick={() => setInput('Aggiungi un caffè vicino alla seconda tappa')}>
            <Mic />
          </Button>
          <Input className="composer-input" aria-label="Messaggio" placeholder="Chiedi o cambia il programma…" value={input} onChange={(event) => setInput(event.target.value)} />
          <Button className="send-button" type="submit" size="icon-lg" aria-label="Invia messaggio" disabled={!input.trim() || thinking}>
            <Send />
          </Button>
        </form>
        <p className="demo-note">
          {placesMode === 'ready' ? 'Google Places connesso · LLM in modalità demo' : placesMode === 'missing' ? 'Google Places pronto · chiave server richiesta' : placesMode === 'error' ? 'Google Places temporaneamente non disponibile' : 'Google Places integrato · attivazione server richiesta'}
        </p>
      </section>

      <Sheet open={routeOpen && itinerary.length > 0} onOpenChange={setRouteOpen}>
        <SheetContent className="route-detail-sheet" side="bottom">
          <SheetHeader>
            <p className="sheet-kicker">Il tuo percorso</p>
            <SheetTitle>Partenza + {itinerary.length} {itinerary.length === 1 ? 'tappa' : 'tappe'}</SheetTitle>
            <SheetDescription>Le tappe scelte, nell’ordine in cui le visiterai.</SheetDescription>
          </SheetHeader>

          <div className="route-detail-scroll">
            <div className="route-detail-stats" aria-label="Riepilogo del percorso">
              <span><small>Partenza</small><strong>{locationLabel}</strong></span>
              <span><small>Distanza</small><strong>{routeDistance == null ? 'da calcolare' : humanDistance(routeDistance)}</strong></span>
              <span><small>Spostamento</small><strong>A piedi</strong></span>
            </div>

            <ol className="route-detail-list">
              <li className="route-detail-origin">
                <span className="route-detail-marker"><MapPin /></span>
                <div><small>Partenza</small><strong>{locationLabel}</strong><span>{city}</span></div>
              </li>
              {itinerary.map((stop, index) => {
                const previous = index === 0 ? coords : itinerary[index - 1];
                const segmentDistance = Number.isFinite(previous.lat) && Number.isFinite(previous.lng) && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
                  ? distanceMeters({ lat: previous.lat!, lng: previous.lng! }, { lat: stop.lat!, lng: stop.lng! })
                  : null;
                return (
                  <li key={stop.id}>
                    <span className="route-detail-marker">{index + 1}</span>
                    <div>
                      <small>{stop.time} · {segmentDistance == null ? 'distanza da calcolare' : `${humanDistance(segmentDistance)} dalla tappa precedente`}</small>
                      <strong>{stop.title}</strong>
                      <span>{stop.address || stop.detail}</span>
                      <em>{stop.detail}</em>
                    </div>
                    {stop.googleMapsUri && (
                      <a href={stop.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri i dettagli di ${stop.title} su Google Maps`}>
                        <ExternalLink />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {googleMapsUrl && (
            <div className="route-export">
              <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                <Navigation /> Apri il percorso in Google Maps <ExternalLink />
              </a>
              <small>Google Maps ricalcolerà percorso pedonale, tempi e aperture nell’app.</small>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent className="profile-sheet" side="right">
          <SheetHeader>
            <p className="sheet-kicker">Memoria</p>
            <SheetTitle>Le cose che Cicero sa di te</SheetTitle>
            <SheetDescription>Le salvi una volta. Vengono considerate in ogni nuovo viaggio.</SheetDescription>
          </SheetHeader>
          {authStatus === 'authenticated' ? (
            <section className="auth-card signed-in" aria-label="Profilo Auth0">
              <span className="auth-avatar">{profileInitials || <UserRound />}</span>
              <span className="auth-copy">
                <strong>{profileDisplayName}</strong>
                <small>{authUser?.email || 'Profilo Auth0 collegato'}</small>
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label="Esci dal profilo" onClick={() => void logoutFromAuth0()}>
                <LogOut />
              </Button>
            </section>
          ) : authStatus !== 'unconfigured' ? (
            <section className="auth-card" aria-label="Accesso al profilo">
              <span className="auth-avatar"><UserRound /></span>
              <span className="auth-copy">
                <strong>{authStatus === 'unconfigured' ? 'Accesso in configurazione' : 'Porta le preferenze con te'}</strong>
                <small>Google, Facebook, TikTok oppure email e password</small>
              </span>
              <Button
                type="button"
                size="sm"
                disabled={authStatus === 'loading' || authStatus === 'unconfigured'}
                onClick={() => void loginWithAuth0()}
              >
                <LogIn /> Accedi
              </Button>
            </section>
          ) : null}
          <div className="preference-list">
            <Preference label="Ritmo tranquillo" detail="Meno tappe, più margine" checked={profile.slowPace} disabled={!profileEditable} onChange={() => toggleProfile('slowPace')} />
            <Preference label="Evita le code" detail="Orari alternativi quando possibile" checked={profile.avoidQueues} disabled={!profileEditable} onChange={() => toggleProfile('avoidQueues')} />
          </div>
          <section className="learned-memory" aria-labelledby="learned-memory-title">
            <div className="learned-memory-head">
              <strong id="learned-memory-title">Imparate conversando</strong>
              <small>Nascono dalle tue richieste</small>
            </div>
            {Object.values(profile.learned).some((values) => values.length) ? (
              <div className="memory-chips">
                {(Object.entries(profile.learned) as Array<[PreferenceCategory, string[]]>).flatMap(([kind, values]) =>
                  values.map((value) => (
                    <button className="memory-chip" type="button" key={`${kind}-${value}`} disabled={!profileEditable} onClick={() => forgetPreference(kind, value)} aria-label={`Rimuovi ${value} da ${preferenceCategoryLabels[kind]}`}>
                      <span><small>{preferenceCategoryLabels[kind]}</small>{value}</span>
                      <X aria-hidden="true" />
                    </button>
                  )),
                )}
              </div>
            ) : (
              <p className="memory-empty">Quando mi dirai cosa preferisci, lo troverai qui.</p>
            )}
          </section>
          <p className="storage-note">
            {profileStatus === 'saved' ? <Check /> : profileStatus === 'loading' || profileStatus === 'saving' ? <LocateFixed className="spin" /> : <X />}
            {profileStatusLabel}
          </p>
        </SheetContent>
      </Sheet>

      <Sheet open={locationOpen} onOpenChange={setLocationOpen}>
        <SheetContent className="location-sheet" side="bottom">
          <SheetHeader>
            <p className="sheet-kicker">Dove andiamo?</p>
            <SheetTitle>Cambia città</SheetTitle>
            <SheetDescription>La mappa cambia; le tue preferenze restano.</SheetDescription>
          </SheetHeader>
          <form className="city-form" onSubmit={changeCity}>
            <Input value={cityInput} onChange={(event) => setCityInput(event.target.value)} placeholder="Es. Lisbona, Portogallo" aria-label="Città" autoFocus />
            <Button type="submit" disabled={locating}>{locating ? 'Cerco…' : 'Vai'}</Button>
          </form>
          <button className="gps-row" type="button" onClick={useCurrentLocation}><LocateFixed /> Usa la mia posizione</button>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function Preference({ label, detail, checked, disabled, onChange }: { label: string; detail: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={`preference-row ${disabled ? 'disabled' : ''}`}>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
