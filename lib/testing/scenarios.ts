import type { Profile } from '@/lib/profile';
import type { ChatAction, PlaceCandidate, Stop } from '@/lib/types';

/** What the panel observes after a turn: agent output, app state and rendered DOM. */
export type StepSnapshot = {
  reply: string;
  actions: ChatAction[];
  itinerary: Stop[];
  candidates: PlaceCandidate[];
  profile: Profile;
  dom: {
    stopMarkers: number;
    candidateMarkers: number;
    itineraryRows: number;
    placesCard: boolean;
    lastAssistantText: string;
  };
  durationMs: number;
};

export type Check = {
  label: string;
  pass: (snapshot: StepSnapshot, previous: StepSnapshot | null) => boolean;
};

export type Step = { say: string; checks: Check[] };

export type Scenario = {
  id: string;
  title: string;
  description: string;
  steps: Step[];
};

const replied: Check = {
  label: 'Il modello risponde e il testo compare in chat',
  pass: (s) => s.reply.trim().length > 0 && s.dom.lastAssistantText.trim() === s.reply.trim(),
};

const within = (ms: number): Check => ({
  label: `Risposta entro ${ms / 1000} s`,
  pass: (s) => s.durationMs <= ms,
});

const stopsAtLeast = (count: number): Check => ({
  label: `Almeno ${count} tappe nell'itinerario`,
  pass: (s) => s.itinerary.length >= count,
});

const stopsEqual = (count: number): Check => ({
  label: `Esattamente ${count} tappe nell'itinerario`,
  pass: (s) => s.itinerary.length === count,
});

const candidatesShown: Check = {
  label: 'Le opzioni sono mostrate (scheda e pin)',
  pass: (s) => s.candidates.length > 0 && s.dom.placesCard && s.dom.candidateMarkers === s.candidates.length,
};

const noCandidates: Check = {
  label: 'Nessuna opzione residua sulla mappa',
  pass: (s) => s.candidates.length === 0 && !s.dom.placesCard && s.dom.candidateMarkers === 0,
};

const guiMatchesState: Check = {
  label: 'Pin e righe della GUI coincidono con lo stato',
  pass: (s) => s.dom.stopMarkers === s.itinerary.length
    && s.dom.itineraryRows === s.itinerary.length
    && s.dom.candidateMarkers === s.candidates.length,
};

const asksQuestion: Check = {
  label: 'Il modello fa una domanda prima di cercare',
  pass: (s) => s.reply.includes('?'),
};

const profileFlag = (key: 'slowPace' | 'avoidQueues' | 'noFish' | 'markets', label: string): Check => ({
  label: `Profilo: ${label} salvato`,
  pass: (s) => s.profile[key] === true,
});

const learned = (category: keyof Profile['learned'], label: string): Check => ({
  label: `Profilo: preferenza ${label} appresa`,
  pass: (s) => s.profile.learned[category].length > 0,
});

const timesShiftedBy = (minutes: number): Check => ({
  label: `Orari spostati di ${minutes} minuti`,
  pass: (s, previous) => {
    if (!previous || previous.itinerary.length === 0 || previous.itinerary.length !== s.itinerary.length) return false;
    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    return s.itinerary.every((stop, index) => ((toMinutes(stop.time) - toMinutes(previous.itinerary[index].time)) % 1440 + 1440) % 1440 === ((minutes % 1440) + 1440) % 1440);
  },
});

const choseOrSkipped: Check = {
  label: 'La scelta aggiunge la tappa e svuota le opzioni (se ce n\'erano)',
  pass: (s, previous) => (previous?.candidates.length ?? 0) === 0
    || (s.itinerary.length === previous!.itinerary.length + 1 && s.candidates.length === 0),
};

export const scenarios: Scenario[] = [
  {
    id: 'full-plan',
    title: 'Itinerario completo',
    description: 'Monumenti aggiunti in automatico, preferenza alimentare salvata, poi il pranzo.',
    steps: [
      {
        say: 'Ho tre ore libere, non mangio pesce. Organizza tu: prima i monumenti principali, poi un posto dove pranzare.',
        checks: [replied, within(60_000), stopsAtLeast(2), noCandidates, guiMatchesState, profileFlag('noFish', 'niente pesce')],
      },
      {
        say: 'Una trattoria classica milanese, senza fretta.',
        checks: [replied, within(60_000), candidatesShown, guiMatchesState],
      },
      {
        say: 'Aggiungi l’opzione A.',
        checks: [replied, within(60_000), choseOrSkipped, guiMatchesState],
      },
    ],
  },
  {
    id: 'cafe-question',
    title: 'Caffè: domanda, poi ricerca',
    description: 'Senza preferenze salvate il modello chiede prima; la risposta viene appresa e cercata.',
    steps: [
      {
        say: 'Trova un caffè qui vicino.',
        checks: [replied, within(45_000), asksQuestion, stopsEqual(0), noCandidates],
      },
      {
        say: 'Un espresso veloce al banco.',
        checks: [replied, within(60_000), candidatesShown, learned('cafe', 'caffè'), guiMatchesState],
      },
    ],
  },
  {
    id: 'edit-plan',
    title: 'Modifica del percorso',
    description: 'Aggiunta di una tappa nominata, spostamento orari e rimozione.',
    steps: [
      {
        say: 'Aggiungi il Duomo di Milano come tappa.',
        checks: [replied, within(60_000), stopsEqual(1), guiMatchesState],
      },
      {
        say: 'Sposta tutto avanti di un’ora.',
        checks: [replied, within(45_000), stopsEqual(1), timesShiftedBy(60)],
      },
      {
        say: 'Togli l’ultima tappa.',
        checks: [replied, within(45_000), stopsEqual(0), guiMatchesState],
      },
    ],
  },
  {
    id: 'pace-preference',
    title: 'Preferenza di ritmo',
    description: 'Una preferenza durevole viene salvata senza toccare l\'itinerario.',
    steps: [
      {
        say: 'Preferisco un ritmo tranquillo, senza fretta.',
        checks: [replied, within(45_000), profileFlag('slowPace', 'ritmo tranquillo'), stopsEqual(0)],
      },
    ],
  },
  {
    id: 'no-invention',
    title: 'Nessuna invenzione',
    description: 'Una richiesta impossibile non produce tappe.',
    steps: [
      {
        say: 'Prenotami un tavolo al ristorante di Gino sulla Luna per stasera.',
        checks: [replied, within(60_000), stopsEqual(0)],
      },
    ],
  },
];
