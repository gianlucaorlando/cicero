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

/**
 * A session is one chat from the opening message. Between the sessions of a
 * scenario the chat is reset but the profile is kept, so later sessions can
 * verify that learned preferences are remembered and applied.
 */
export type Session = { title: string; steps: Step[] };

export type Scenario = {
  id: string;
  title: string;
  description: string;
  sessions: Session[];
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

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

const stopsGrewBy = (count: number): Check => ({
  label: `L'itinerario ha ${count} ${count === 1 ? 'tappa' : 'tappe'} in più`,
  pass: (s, previous) => s.itinerary.length === (previous?.itinerary.length ?? 0) + count,
});

const stopsRemoved = (count: number): Check => ({
  label: `${count} ${count === 1 ? 'tappa rimossa' : 'tappe rimosse'}, le altre intatte`,
  pass: (s, previous) => {
    if (!previous || s.itinerary.length !== previous.itinerary.length - count) return false;
    const remaining = new Set(s.itinerary.map((stop) => stop.id));
    return s.itinerary.every((stop) => previous.itinerary.some((old) => old.id === stop.id)) && remaining.size === s.itinerary.length;
  },
});

const stopsUnchanged: Check = {
  label: 'Le tappe esistenti non sono state toccate',
  pass: (s, previous) => (previous?.itinerary ?? []).every((old) => s.itinerary.some((stop) => stop.id === old.id)),
};

const candidatesShown: Check = {
  label: 'Le opzioni sono mostrate (scheda e pin)',
  pass: (s) => s.candidates.length > 0 && s.dom.placesCard && s.dom.candidateMarkers === s.candidates.length,
};

const noCandidates: Check = {
  label: 'Nessuna opzione residua sulla mappa',
  pass: (s) => s.candidates.length === 0 && !s.dom.placesCard && s.dom.candidateMarkers === 0,
};

const candidatesOrStops: Check = {
  label: 'Mostra opzioni oppure aggiunge direttamente una tappa',
  pass: (s, previous) => s.candidates.length > 0 || s.itinerary.length > (previous?.itinerary.length ?? 0),
};

const candidatesOrQuestion: Check = {
  label: 'Mostra opzioni oppure fa una domanda mirata',
  pass: (s) => s.candidates.length > 0 || s.reply.includes('?'),
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

const searchesWithoutAsking: Check = {
  label: 'Usa le preferenze salvate senza richiederle',
  pass: (s) => s.candidates.length > 0 || s.itinerary.length > 0,
};

const profileFlag = (key: 'slowPace' | 'avoidQueues' | 'noFish' | 'markets', label: string): Check => ({
  label: `Profilo: ${label} salvato`,
  pass: (s) => s.profile[key] === true,
});

const learned = (category: keyof Profile['learned'], label: string): Check => ({
  label: `Profilo: preferenza ${label} appresa`,
  pass: (s) => s.profile.learned[category].length > 0,
});

const learnedMatches = (category: keyof Profile['learned'], pattern: RegExp, label: string): Check => ({
  label: `Profilo: ${label} tra le preferenze apprese`,
  pass: (s) => s.profile.learned[category].some((value) => pattern.test(value)),
});

const learnedStillThere = (category: keyof Profile['learned'], label: string): Check => ({
  label: `Profilo: la preferenza ${label} è ancora ricordata dalla sessione precedente`,
  pass: (s) => s.profile.learned[category].length > 0,
});

const noStopMatching = (pattern: RegExp, label: string): Check => ({
  label: `Nessuna tappa ${label} rimasta`,
  pass: (s) => !s.itinerary.some((stop) => pattern.test(`${stop.title} ${stop.primaryType || ''}`)),
});

const firstStopMatches = (pattern: RegExp, label: string): Check => ({
  label: `La prima tappa è ${label}`,
  pass: (s) => pattern.test(s.itinerary[0]?.title || ''),
});

const timesAscending: Check = {
  label: 'Gli orari seguono il nuovo ordine',
  pass: (s) => s.itinerary.every((stop, index) => index === 0 || stop.time >= s.itinerary[index - 1].time),
};

const timesShiftedBy = (minutes: number): Check => ({
  label: `Orari spostati di ${minutes} minuti`,
  pass: (s, previous) => {
    if (!previous || previous.itinerary.length === 0 || previous.itinerary.length !== s.itinerary.length) return false;
    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const expected = ((minutes % 1440) + 1440) % 1440;
    return s.itinerary.every((stop, index) => ((toMinutes(stop.time) - toMinutes(previous.itinerary[index].time)) % 1440 + 1440) % 1440 === expected);
  },
});

const choseOrSkipped: Check = {
  label: 'La scelta aggiunge la tappa e svuota le opzioni (se ce n\'erano)',
  pass: (s, previous) => (previous?.candidates.length ?? 0) === 0
    || (s.itinerary.length === previous!.itinerary.length + 1 && s.candidates.length === 0),
};

const chose = (count: number): Check => ({
  label: `${count === 1 ? 'La scelta aggiunge' : 'Le scelte aggiungono'} ${count} ${count === 1 ? 'tappa' : 'tappe'} e svuota le opzioni`,
  pass: (s, previous) => s.itinerary.length === (previous?.itinerary.length ?? 0) + count && s.candidates.length === 0,
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const single = (title: string, steps: Step[]): Session[] => [{ title, steps }];

export const scenarios: Scenario[] = [
  {
    id: 'full-plan',
    title: 'Itinerario completo',
    description: 'Monumenti aggiunti in automatico, preferenza alimentare salvata, poi il pranzo.',
    sessions: single('Mattina', [
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
    ]),
  },
  {
    id: 'cafe-question',
    title: 'Caffè: domanda, poi ricerca',
    description: 'Senza preferenze salvate il modello chiede prima; la risposta viene appresa e cercata.',
    sessions: single('Pausa', [
      {
        say: 'Trova un caffè qui vicino.',
        checks: [replied, within(45_000), asksQuestion, stopsEqual(0), noCandidates],
      },
      {
        say: 'Un espresso veloce al banco.',
        checks: [replied, within(60_000), candidatesShown, learned('cafe', 'caffè'), guiMatchesState],
      },
    ]),
  },
  {
    id: 'edit-plan',
    title: 'Modifica del percorso',
    description: 'Aggiunta di una tappa nominata, spostamento orari e rimozione.',
    sessions: single('Ritocchi', [
      {
        say: 'Aggiungi il Duomo di Milano come tappa.',
        checks: [replied, within(60_000), stopsEqual(1), guiMatchesState],
      },
      {
        say: 'Aggiungi anche il Castello Sforzesco.',
        checks: [replied, within(60_000), stopsEqual(2), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Metti il Castello prima del Duomo.',
        checks: [replied, within(45_000), stopsEqual(2), firstStopMatches(/castello/i, 'il Castello'), timesAscending, guiMatchesState],
      },
      {
        say: 'Sposta tutto avanti di un’ora.',
        checks: [replied, within(45_000), stopsEqual(2), timesShiftedBy(60)],
      },
      {
        say: 'Togli l’ultima tappa.',
        checks: [replied, within(45_000), stopsEqual(1), firstStopMatches(/castello/i, 'il Castello'), guiMatchesState],
      },
    ]),
  },
  {
    id: 'pace-preference',
    title: 'Preferenza di ritmo',
    description: 'Una preferenza durevole viene salvata senza toccare l\'itinerario.',
    sessions: single('Una frase', [
      {
        say: 'Preferisco un ritmo tranquillo, senza fretta.',
        checks: [replied, within(45_000), profileFlag('slowPace', 'ritmo tranquillo'), stopsEqual(0)],
      },
    ]),
  },
  {
    id: 'no-invention',
    title: 'Nessuna invenzione',
    description: 'Una richiesta impossibile non produce tappe.',
    sessions: single('Provocazione', [
      {
        say: 'Prenotami un tavolo al ristorante di Gino sulla Luna per stasera.',
        checks: [replied, within(60_000), stopsEqual(0)],
      },
    ]),
  },

  // -------------------------------------------------------------------------
  // Utente indeciso: scenari lunghi su più sessioni
  // -------------------------------------------------------------------------
  {
    id: 'indecisive-afternoon',
    title: 'Indeciso: museo, poi shopping, poi caffè',
    description: 'Cambia idea sul museo, passa allo shopping, aggiunge due tappe, poi un caffè, poi taglia. Il giorno dopo le preferenze devono essere ricordate.',
    sessions: [
      {
        title: 'Sessione 1 · pomeriggio indeciso',
        steps: [
          {
            say: 'Ho tutto il pomeriggio libero ma non so bene cosa fare. Forse un museo?',
            checks: [replied, within(60_000), candidatesOrQuestion, stopsEqual(0)],
          },
          {
            say: 'Mmm, arte contemporanea più che altro.',
            checks: [replied, within(60_000), candidatesOrStops, learned('museum', 'musei'), guiMatchesState],
          },
          {
            say: 'Ok, prendi la B.',
            checks: [replied, within(60_000), choseOrSkipped, stopsAtLeast(1), guiMatchesState],
          },
          {
            say: 'Anzi no, ho cambiato idea: niente musei oggi, toglilo. Preferisco fare shopping.',
            checks: [replied, within(60_000), stopsEqual(0), noStopMatching(/muse/i, 'museo'), candidatesOrQuestion],
          },
          {
            say: 'Vintage e negozi di dischi.',
            checks: [replied, within(60_000), candidatesShown, learned('shopping', 'shopping'), guiMatchesState],
          },
          {
            say: 'Aggiungi la A e la C.',
            checks: [replied, within(60_000), chose(2), guiMatchesState],
          },
          {
            say: 'Poi un caffè vicino all’ultima tappa, uno tranquillo dove sedermi un po’.',
            checks: [replied, within(60_000), candidatesOrStops, stopsUnchanged, guiMatchesState],
          },
          {
            say: 'Il primo va benissimo.',
            checks: [replied, within(60_000), choseOrSkipped, stopsAtLeast(3), guiMatchesState],
          },
          {
            say: 'Togli la seconda tappa, non ho tempo per tutto.',
            checks: [replied, within(45_000), stopsRemoved(1), guiMatchesState],
          },
          {
            say: 'Sposta tutto di mezz’ora più tardi.',
            checks: [replied, within(45_000), timesShiftedBy(30), guiMatchesState],
          },
        ],
      },
      {
        title: 'Sessione 2 · il giorno dopo',
        steps: [
          {
            say: 'Oggi ho di nuovo voglia di fare un po’ di shopping.',
            checks: [replied, within(60_000), learnedStillThere('shopping', 'shopping'), searchesWithoutAsking, guiMatchesState],
          },
          {
            say: 'E poi un museo, di quelli che piacciono a me.',
            checks: [replied, within(60_000), learnedStillThere('museum', 'musei'), candidatesOrStops, guiMatchesState],
          },
          {
            say: 'No, lascia stare il museo. Solo lo shopping: aggiungi la prima opzione che avevi trovato.',
            checks: [replied, within(60_000), noStopMatching(/muse/i, 'museo'), candidatesOrStops, guiMatchesState],
          },
        ],
      },
    ],
  },
  {
    id: 'dinner-second-thoughts',
    title: 'Cena e serata con ripensamenti',
    description: 'Giapponese poi pizzeria, serata jazz, poi sostituisce la pizzeria, poi cancella la serata. La settimana dopo vuole cenare "come al solito" e poi cambia di nuovo.',
    sessions: [
      {
        title: 'Sessione 1 · stasera',
        steps: [
          {
            say: 'Stasera vorrei cenare fuori e poi fare qualcosa.',
            checks: [replied, within(60_000), asksQuestion, stopsEqual(0)],
          },
          {
            say: 'Cucina giapponese… anzi no, meglio una pizzeria.',
            checks: [replied, within(60_000), candidatesShown, learnedMatches('restaurant', /pizz/i, 'pizzeria'), guiMatchesState],
          },
          {
            say: 'Prendo la C.',
            checks: [replied, within(60_000), chose(1), guiMatchesState],
          },
          {
            say: 'Per dopo cena qualcosa con musica dal vivo, jazz se possibile. Scegli tu il migliore e aggiungilo.',
            checks: [replied, within(60_000), stopsGrewBy(1), stopsUnchanged, noCandidates, guiMatchesState],
          },
          {
            say: 'Ripensandoci, la pizzeria non mi convince. Toglila e cercami una trattoria al suo posto.',
            checks: [replied, within(60_000), noStopMatching(/pizz/i, 'pizzeria'), candidatesOrStops, guiMatchesState],
          },
          {
            say: 'Ok, aggiungi la A.',
            checks: [replied, within(60_000), choseOrSkipped, stopsEqual(2), guiMatchesState],
          },
          {
            say: 'Alla fine niente serata, sono stanco: tieni solo la cena e cancella il resto.',
            checks: [replied, within(60_000), stopsEqual(1), noStopMatching(/jazz|bar|club|live|music/i, 'per la serata'), guiMatchesState],
          },
        ],
      },
      {
        title: 'Sessione 2 · una settimana dopo',
        steps: [
          {
            say: 'Ho voglia di cenare fuori anche stasera, come al solito.',
            checks: [replied, within(60_000), learnedStillThere('restaurant', 'ristoranti'), searchesWithoutAsking, guiMatchesState],
          },
          {
            say: 'No aspetta, stasera niente pizza: qualcosa di completamente diverso, sorprendimi.',
            checks: [replied, within(60_000), candidatesOrStops, guiMatchesState],
          },
          {
            say: 'La B.',
            checks: [replied, within(60_000), choseOrSkipped, stopsAtLeast(1), guiMatchesState],
          },
        ],
      },
    ],
  },
  {
    id: 'full-day-cancellations',
    title: 'Giornata piena, poi cancella tutto',
    description: 'Cinque tappe costruite in sequenza, due monumenti tolti, uno rimesso, poi tabula rasa e un solo caffè.',
    sessions: single('Sessione unica · giornata intera', [
      {
        say: 'Ho l’intera giornata. Organizza tu: tre monumenti, poi un pranzo veloce, poi un museo.',
        checks: [replied, within(90_000), stopsAtLeast(3), candidatesOrQuestion, guiMatchesState],
      },
      {
        say: 'Per pranzo un panino o street food, qualsiasi cosa va bene: scegli tu e aggiungilo.',
        // Dopo l'aggiunta il modello può già proporre le opzioni per il museo: le opzioni residue sono legittime.
        checks: [replied, within(60_000), stopsGrewBy(1), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Per il museo scegli tu tra storia e scienza e aggiungilo direttamente.',
        checks: [replied, within(60_000), stopsGrewBy(1), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Sono troppe. Togli il secondo e il terzo monumento.',
        checks: [replied, within(60_000), stopsRemoved(2), guiMatchesState],
      },
      {
        say: 'Però rimetti un monumento vicino al museo, uno solo, scegli tu.',
        checks: [replied, within(60_000), candidatesOrStops, stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Cancella tutto e ricominciamo da zero.',
        checks: [replied, within(45_000), stopsEqual(0), noCandidates, guiMatchesState],
      },
      {
        say: 'Solo un caffè: un espresso veloce al banco.',
        checks: [replied, within(60_000), candidatesOrStops, guiMatchesState],
      },
    ]),
  },
];
