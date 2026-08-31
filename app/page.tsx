'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  CloudRain,
  Coffee,
  ExternalLink,
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
  distanceMeters: number;
};

type Profile = {
  slowPace: boolean;
  avoidQueues: boolean;
  noFish: boolean;
  markets: boolean;
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Sei nel centro di Milano. Dimmi quanto tempo hai: terrò insieme meteo, distanze e ciò che preferisci.',
    meta: 'Posizione e meteo aggiornati ora',
  },
];

const initialProfile: Profile = {
  slowPace: true,
  avoidQueues: true,
  noFish: true,
  markets: true,
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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [itinerary, setItinerary] = useState<Stop[]>(emptyPlan);
  const [placeCandidates, setPlaceCandidates] = useState<PlaceCandidate[]>([]);
  const [placesMode, setPlacesMode] = useState<'unknown' | 'ready' | 'missing' | 'error'>('unknown');
  const [selectingPlace, setSelectingPlace] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [city, setCity] = useState('Milano');
  const [cityInput, setCityInput] = useState('Milano');
  const [addressInput, setAddressInput] = useState('');
  const [locationLabel, setLocationLabel] = useState('Centro');
  const [coords, setCoords] = useState({ lat: 45.4642, lng: 9.19 });
  const [weather, setWeather] = useState('meteo in arrivo');
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const nextId = useRef(2);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('cicero-profile');
    if (saved) {
      try { setProfile(JSON.parse(saved) as Profile); } catch { /* ignore invalid local data */ }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('cicero-profile', JSON.stringify(profile));
  }, [profile]);

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

  async function searchPlaces(query: string, origin = coords) {
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
          openNow: true,
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
          ? `Ho trovato ${candidates.length} opzioni aperte vicino al punto scelto. Sono risultati reali di Places: scegli quale aggiungere.`
          : 'Non trovo luoghi aperti adatti vicino al punto scelto. Non aggiungo alternative inventate.',
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
    } catch {
      append('assistant', `Non riesco a verificare i dettagli di ${candidate.name}; non l’ho aggiunto.`, 'Itinerario invariato');
    } finally {
      setSelectingPlace(null);
    }
  }

  function handlePrompt(prompt: string) {
    if (thinking) return;
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

  function interpretMessage(value: string) {
    const normalized = value.toLocaleLowerCase('it');
    append('user', value);

    if (normalized.includes('togli') || normalized.includes('rimuovi')) {
      setItinerary((current) => {
        const museumIndex = normalized.includes('muse') ? current.findIndex((stop) => stop.primaryType?.includes('museum')) : -1;
        const index = museumIndex >= 0 ? museumIndex : current.length - 1;
        return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current;
      });
      reply('Fatto: ho rimosso solo la tappa indicata. Il resto rimane com’era.', 'Itinerario aggiornato, non rigenerato');
      return;
    }

    if (normalized.includes('caff')) {
      const origin = normalized.includes('second') && itinerary[1]?.lat != null && itinerary[1]?.lng != null
        ? { lat: itinerary[1].lat!, lng: itinerary[1].lng! }
        : coords;
      void searchPlaces('caffè', origin);
      return;
    }

    if (normalized.includes('ristor') || normalized.includes('pranzo') || normalized.includes('cena') || normalized.includes('mang')) {
      void searchPlaces(profile.noFish ? 'ristorante senza pesce' : 'ristorante');
      return;
    }

    if (normalized.includes('muse') || normalized.includes('mostra') || normalized.includes('arte')) {
      void searchPlaces('museo');
      return;
    }

    if (normalized.includes('ora') || normalized.includes('60 minut')) {
      setItinerary((current) => current.map((stop) => ({ ...stop, time: shiftTime(stop.time, 60) })));
      reply('Spostato tutto avanti di un’ora, mantenendo distanze e ordine delle tappe.', 'Orari aggiornati');
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

  function toggleProfile(key: keyof Profile) {
    setProfile((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <main className={`app-shell ${mapOpen ? '' : 'map-collapsed'}`}>
      <section className="map-stage" aria-label="Mappa dell’itinerario">
        <MapPicker coords={coords} onChange={movePin} />
        <div className="map-wash" aria-hidden="true" />

        <header className="topbar">
          <a className="brand" href="#" aria-label="Cicero, home">
            <span className="brand-mark"><Navigation /></span>
            <span>Cicero</span>
          </a>
          <Button className="profile-button" variant="outline" size="icon" aria-label="Apri il profilo" onClick={() => setProfileOpen(true)}>
            GO
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

        {itinerary.length > 0 && (
          <div className="route-summary">
            <Route />
            <div><strong>{itinerary.length} tappe</strong><span>percorso aggiornato</span></div>
          </div>
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
            <SlidersHorizontal /> {Object.values(profile).filter(Boolean).length} preferenze
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
            <article className="places-card" aria-label="Risultati Google Places">
              <div className="places-card-head">
                <div><span>Vicino al punto scelto</span><strong>Scegli una tappa</strong></div>
                <Badge variant="outline">live</Badge>
              </div>
              <div className="place-options">
                {placeCandidates.map((place) => (
                  <div className="place-option" key={place.id}>
                    <button type="button" onClick={() => void addPlace(place)} disabled={selectingPlace !== null}>
                      <span className="place-option-copy">
                        <strong>{place.name}</strong>
                        <small>{humanDistance(place.distanceMeters)} · {place.address}</small>
                      </span>
                      <span className="place-add">{selectingPlace === place.id ? <LocateFixed className="spin" /> : '+'}</span>
                    </button>
                    {place.googleMapsUri && (
                      <a href={place.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri ${place.name} su Google Maps`}>
                        <ExternalLink />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="google-attribution">Dati luogo forniti da <strong>Google Maps</strong></p>
            </article>
          )}

          {itinerary.length > 0 && (
            <article className="itinerary-card" aria-label="Itinerario corrente">
              <div className="itinerary-title">
                <div><span>Il piano vivo</span><strong>{itinerary.length} tappe · circa 2 ore</strong></div>
                <Badge variant="outline">{itinerary.some((stop) => stop.source === 'google_places') ? 'live' : 'demo'}</Badge>
              </div>
              <ol>
                {itinerary.map((stop, index) => (
                  <li key={stop.id}>
                    <time>{stop.time}</time>
                    <span className={`stop-icon ${stop.kind}`}>
                      {stop.kind === 'coffee' ? <Coffee /> : stop.kind === 'walk' ? <Route /> : index + 1}
                    </span>
                    <div>
                      {stop.googleMapsUri ? <a href={stop.googleMapsUri} target="_blank" rel="noreferrer"><strong>{stop.title}</strong><ExternalLink /></a> : <strong>{stop.title}</strong>}
                      <span>{stop.detail}</span>
                    </div>
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
          <button type="button" onClick={() => { append('user', 'Trova un caffè qui vicino'); void searchPlaces('caffè'); }}>Caffè qui vicino</button>
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

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent className="profile-sheet" side="right">
          <SheetHeader>
            <p className="sheet-kicker">Memoria</p>
            <SheetTitle>Le cose che Cicero sa di te</SheetTitle>
            <SheetDescription>Le salvi una volta. Vengono considerate in ogni nuovo viaggio.</SheetDescription>
          </SheetHeader>
          <div className="preference-list">
            <Preference label="Ritmo tranquillo" detail="Meno tappe, più margine" checked={profile.slowPace} onChange={() => toggleProfile('slowPace')} />
            <Preference label="Evita le code" detail="Orari alternativi quando possibile" checked={profile.avoidQueues} onChange={() => toggleProfile('avoidQueues')} />
            <Preference label="Non mangio pesce" detail="Escluso dai suggerimenti" checked={profile.noFish} onChange={() => toggleProfile('noFish')} />
            <Preference label="Mi piacciono i mercati" detail="Priorità a esperienze locali" checked={profile.markets} onChange={() => toggleProfile('markets')} />
          </div>
          <p className="storage-note"><Check /> Salvato su questo dispositivo</p>
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

function Preference({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="preference-row">
      <span><strong>{label}</strong><small>{detail}</small></span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
