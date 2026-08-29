'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  CloudRain,
  Coffee,
  LocateFixed,
  MapPin,
  Mic,
  Navigation,
  Route,
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

function mapEmbed(lat: number, lng: number) {
  const dx = 0.011;
  const dy = 0.007;
  const bbox = [lng - dx, lat - dy, lng + dx, lat + dy].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function shiftTime(value: string, minutes: number) {
  const [hours, mins] = value.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [itinerary, setItinerary] = useState<Stop[]>(emptyPlan);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [city, setCity] = useState('Milano');
  const [cityInput, setCityInput] = useState('Milano');
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

  const mapUrl = useMemo(() => mapEmbed(coords.lat, coords.lng), [coords]);

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
  }, [messages, thinking]);

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

  function buildDemoPlan() {
    setItinerary([
      {
        id: 'indoor',
        time: '14:10',
        title: 'Tappa indoor verificata',
        detail: '8 min a piedi · 35 min',
        kind: 'place',
      },
      {
        id: 'culture',
        time: '15:00',
        title: 'Seconda tappa culturale',
        detail: '6 min a piedi · 45 min',
        kind: 'place',
      },
      {
        id: 'coffee',
        time: '15:55',
        title: 'Caffè vicino al percorso',
        detail: '3 min a piedi · €€',
        kind: 'coffee',
      },
    ]);
  }

  function handlePrompt(prompt: string) {
    if (thinking) return;
    append('user', prompt);

    if (prompt === 'Cosa faccio adesso?') {
      buildDemoPlan();
      reply(
        'Ti preparo due ore compatte e quasi tutte al coperto. In questa demo Places non è collegato: lascio i nomi come segnaposto invece di inventare locali o orari.',
        '3 tappe · aggiornamento incrementale',
      );
      return;
    }

    if (prompt === 'Ritmo tranquillo') {
      setProfile((current) => ({ ...current, slowPace: true }));
      reply('Memorizzato: ritmo tranquillo. Da ora riduco le tappe e aggiungo più margine tra una e l’altra.', 'Salvato nel tuo profilo');
      return;
    }

    setItinerary((current) => current.map((stop, index) => ({
      ...stop,
      detail: index < 2 ? `${stop.detail.split(' · ')[0]} · al coperto` : stop.detail,
    })));
    reply('Ho adattato solo le tappe esposte alla pioggia; il resto del percorso non cambia.', 'Meteo ricontrollato ora');
  }

  function interpretMessage(value: string) {
    const normalized = value.toLocaleLowerCase('it');
    append('user', value);

    if (normalized.includes('togli') || normalized.includes('rimuovi')) {
      setItinerary((current) => current.filter((stop) => stop.id !== 'culture'));
      reply('Fatto: ho tolto solo la seconda tappa e avvicinato il caffè. Il resto rimane com’era.', 'Itinerario aggiornato, non rigenerato');
      return;
    }

    if (normalized.includes('caff')) {
      setItinerary((current) => {
        const withoutCoffee = current.filter((stop) => stop.kind !== 'coffee');
        const insertAt = Math.min(2, withoutCoffee.length);
        return [
          ...withoutCoffee.slice(0, insertAt),
          { id: 'coffee', time: '15:55', title: 'Caffè vicino alla seconda tappa', detail: 'da verificare con Places · €€', kind: 'coffee' },
          ...withoutCoffee.slice(insertAt),
        ];
      });
      reply('Ho inserito il caffè vicino alla seconda tappa, senza toccare il resto. Il nome resta in sospeso finché Places non conferma un posto adatto.', 'Modifica locale applicata');
      return;
    }

    if (normalized.includes('ora') || normalized.includes('60 minut')) {
      setItinerary((current) => current.map((stop) => ({ ...stop, time: shiftTime(stop.time, 60) })));
      reply('Spostato tutto avanti di un’ora, mantenendo distanze e ordine delle tappe.', 'Orari aggiornati');
      return;
    }

    if (itinerary.length === 0) buildDemoPlan();
    reply('Posso già mostrarti il flusso: prova “togli la seconda tappa”, “aggiungi un caffè” oppure “sposta tutto di un’ora”.', 'Demo conversazionale');
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

  async function changeCity(event: FormEvent) {
    event.preventDefault();
    const query = cityInput.trim();
    if (!query) return;
    setLocating(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const [result] = await response.json();
      if (!result) throw new Error('not found');
      setCoords({ lat: Number(result.lat), lng: Number(result.lon) });
      setCity(query);
      setLocationLabel('centro città');
      setLocationOpen(false);
      setItinerary([]);
      append('assistant', `Siamo a ${query}. Ho azzerato solo le tappe della città precedente; le tue preferenze restano memorizzate.`, 'Mappa aggiornata');
    } catch {
      setLocationOpen(false);
      reply(`Non trovo “${query}” con sufficiente certezza. Prova con città e Paese.`);
    } finally {
      setLocating(false);
    }
  }

  function toggleProfile(key: keyof Profile) {
    setProfile((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <main className={`app-shell ${mapOpen ? '' : 'map-collapsed'}`}>
      <section className="map-stage" aria-label="Mappa dell’itinerario">
        <iframe className="map-frame" title={`Mappa di ${city}`} src={mapUrl} loading="eager" />
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

          {itinerary.length > 0 && (
            <article className="itinerary-card" aria-label="Itinerario corrente">
              <div className="itinerary-title">
                <div><span>Il piano vivo</span><strong>{itinerary.length} tappe · circa 2 ore</strong></div>
                <Badge variant="outline">demo</Badge>
              </div>
              <ol>
                {itinerary.map((stop, index) => (
                  <li key={stop.id}>
                    <time>{stop.time}</time>
                    <span className={`stop-icon ${stop.kind}`}>
                      {stop.kind === 'coffee' ? <Coffee /> : stop.kind === 'walk' ? <Route /> : index + 1}
                    </span>
                    <div><strong>{stop.title}</strong><span>{stop.detail}</span></div>
                  </li>
                ))}
              </ol>
              <p className="data-warning"><Umbrella /> I nomi reali appariranno solo dopo la verifica con Places.</p>
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
        <p className="demo-note">Demo interattiva · Places e LLM non ancora collegati</p>
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
