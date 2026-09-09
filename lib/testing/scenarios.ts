import type { Profile } from '@/lib/profile';
import type { ChatAction, PlaceCandidate, Proposal, Stop } from '@/lib/types';

/** What the panel observes after a turn: agent output, app state and rendered DOM. */
export type StepSnapshot = {
  reply: string;
  actions: ChatAction[];
  itinerary: Stop[];
  candidates: PlaceCandidate[];
  proposal: Proposal | null;
  suggestions: string[];
  profile: Profile;
  dom: {
    stopMarkers: number;
    candidateMarkers: number;
    itineraryRows: number;
    placesCard: boolean;
    proposalCard: boolean;
    suggestionChips: number;
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

/** Every turn must end with tappable quick replies, the core of the "propose, then confirm" dialogue. */
const offersReplies: Check = {
  label: 'Il turno si chiude con 2–4 risposte rapide toccabili',
  // Under a proposal the chips that duplicate the card buttons are hidden, so fewer chips than suggestions is fine.
  pass: (s) => s.suggestions.length >= 2 && s.suggestions.length <= 4 && s.dom.suggestionChips >= 1 && s.dom.suggestionChips <= s.suggestions.length,
};

const proposalShown: Check = {
  label: 'Una sola proposta è mostrata (scheda e pin)',
  pass: (s) => s.proposal !== null && s.dom.proposalCard && s.dom.candidateMarkers === 1 && !s.dom.placesCard,
};

const proposalChanged: Check = {
  label: 'La nuova proposta è diversa dalla precedente',
  pass: (s, previous) => s.proposal !== null && s.proposal.candidate.id !== previous?.proposal?.candidate.id,
};

const proposalOrQuestion: Check = {
  label: 'Propone qualcosa oppure fa una sola domanda mirata',
  pass: (s) => s.proposal !== null || s.reply.includes('?'),
};

const noProposal: Check = {
  label: 'Nessuna proposta o lista residua',
  pass: (s) => s.proposal === null && s.candidates.length === 0 && !s.dom.proposalCard && !s.dom.placesCard && s.dom.candidateMarkers === 0,
};

const noList: Check = {
  label: 'Nessuna lista di opzioni: si procede per proposte',
  pass: (s) => !s.dom.placesCard,
};

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
    return s.itinerary.every((stop) => previous.itinerary.some((old) => old.id === stop.id));
  },
});

const stopsUnchanged: Check = {
  label: 'Le tappe esistenti non sono state toccate',
  pass: (s, previous) => (previous?.itinerary ?? []).every((old) => s.itinerary.some((stop) => stop.id === old.id)),
};

/** Accepting the proposal on the table adds exactly that place. */
const acceptedProposal: Check = {
  label: 'Il sì aggiunge la tappa proposta e chiude la proposta',
  pass: (s, previous) => {
    const proposed = previous?.proposal?.candidate.id;
    if (!proposed) return false;
    return s.itinerary.length === previous!.itinerary.length + 1
      && s.itinerary.some((stop) => stop.placeId === proposed)
      && (s.proposal === null || s.proposal.candidate.id !== proposed);
  },
};

const guiMatchesState: Check = {
  label: 'Pin e righe della GUI coincidono con lo stato',
  pass: (s) => s.dom.stopMarkers === s.itinerary.length
    && s.dom.itineraryRows === s.itinerary.length
    && s.dom.candidateMarkers === (s.proposal ? 1 : s.candidates.length),
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

// ---------------------------------------------------------------------------
// Scenarios: the user mostly answers yes or no
// ---------------------------------------------------------------------------

const single = (title: string, steps: Step[]): Session[] => [{ title, steps }];
const base = [replied, within(60_000), offersReplies];

export const scenarios: Scenario[] = [
  {
    id: 'propose-first',
    title: 'Cicero propone, io dico sì',
    description: 'Dal tempo disponibile arriva subito una proposta concreta; ogni sì porta alla proposta successiva.',
    sessions: single('Due ore libere', [
      {
        say: 'Ho un paio d’ore libere, fai tu.',
        checks: [...base, proposalShown, noList, stopsEqual(0), guiMatchesState],
      },
      {
        say: 'Sì, aggiungila.',
        checks: [...base, acceptedProposal, noList, guiMatchesState],
      },
      {
        say: 'Sì, va bene anche questa.',
        checks: [...base, stopsAtLeast(2), noList, guiMatchesState],
      },
      {
        say: 'Basta così, grazie.',
        checks: [...base, stopsUnchanged, noProposal, guiMatchesState],
      },
    ]),
  },
  {
    id: 'decline-then-accept',
    title: 'Un caffè: no, no, poi sì',
    description: 'Senza preferenze Cicero propone un default; due rifiuti portano alternative già trovate, poi il sì aggiunge.',
    sessions: single('Pausa', [
      {
        say: 'Vorrei un caffè qui vicino.',
        checks: [...base, proposalShown, noList, stopsEqual(0), guiMatchesState],
      },
      {
        say: 'No, un’altra.',
        checks: [...base, proposalShown, proposalChanged, stopsEqual(0), guiMatchesState],
      },
      {
        say: 'No, preferisco un posto tranquillo dove sedermi.',
        checks: [...base, proposalShown, proposalChanged, stopsEqual(0), guiMatchesState],
      },
      {
        say: 'Sì, perfetto.',
        // The preference may be saved at the motivated refusal or at the confirming yes: both are fine.
        checks: [...base, acceptedProposal, learned('cafe', 'caffè'), guiMatchesState],
      },
    ]),
  },
  {
    id: 'full-plan',
    title: 'Aggiungi direttamente: monumenti, poi pranzo',
    description: 'Solo con una richiesta inequivocabile le tappe vengono aggiunte insieme; la preferenza alimentare è salvata e il pranzo viene proposto.',
    sessions: single('Mattina', [
      {
        say: 'Ho tre ore, non mangio pesce. Aggiungi direttamente i monumenti principali senza chiedermi, poi proponimi dove pranzare.',
        checks: [...base, within(90_000), stopsAtLeast(2), noList, profileFlag('noFish', 'niente pesce'), proposalOrQuestion, guiMatchesState],
      },
      {
        say: 'Sì, va bene.',
        checks: [...base, stopsAtLeast(3), noList, guiMatchesState],
      },
    ]),
  },
  {
    id: 'edit-plan',
    title: 'Modifica del percorso',
    description: 'Aggiunte esplicite, riordino, spostamento orari e rimozione.',
    sessions: single('Ritocchi', [
      {
        say: 'Aggiungi direttamente il Duomo di Milano, senza chiedere.',
        checks: [...base, stopsEqual(1), guiMatchesState],
      },
      {
        say: 'Aggiungi direttamente anche il Castello Sforzesco.',
        checks: [...base, stopsEqual(2), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Metti il Castello prima del Duomo.',
        checks: [...base, stopsEqual(2), firstStopMatches(/castello/i, 'il Castello'), timesAscending, guiMatchesState],
      },
      {
        say: 'Sposta tutto avanti di un’ora.',
        checks: [...base, stopsEqual(2), timesShiftedBy(60)],
      },
      {
        say: 'Togli l’ultima tappa.',
        checks: [...base, stopsEqual(1), firstStopMatches(/castello/i, 'il Castello'), guiMatchesState],
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
        checks: [...base, profileFlag('slowPace', 'ritmo tranquillo'), stopsEqual(0)],
      },
    ]),
  },
  {
    id: 'no-invention',
    title: 'Nessuna invenzione',
    description: 'Una richiesta impossibile non produce tappe né proposte inventate.',
    sessions: single('Provocazione', [
      {
        say: 'Prenotami un tavolo al ristorante di Gino sulla Luna per stasera.',
        checks: [...base, stopsEqual(0), noProposal],
      },
    ]),
  },

  // -------------------------------------------------------------------------
  // Utente indeciso: scenari lunghi su più sessioni
  // -------------------------------------------------------------------------
  {
    id: 'indecisive-afternoon',
    title: 'Indeciso: museo, poi shopping, poi caffè',
    description: 'Accetta un museo, cambia idea e passa allo shopping, aggiunge, taglia, sposta. Il giorno dopo le preferenze guidano le proposte.',
    sessions: [
      {
        title: 'Sessione 1 · pomeriggio indeciso',
        steps: [
          {
            say: 'Ho tutto il pomeriggio libero ma non so bene cosa fare.',
            checks: [...base, proposalOrQuestion, noList, stopsEqual(0), guiMatchesState],
          },
          {
            say: 'Mmm, preferirei un museo di arte contemporanea.',
            checks: [...base, proposalShown, learned('museum', 'musei'), stopsEqual(0), guiMatchesState],
          },
          {
            say: 'Sì, va bene.',
            checks: [...base, acceptedProposal, guiMatchesState],
          },
          {
            say: 'Anzi no, ho cambiato idea: toglilo, preferisco fare shopping vintage.',
            checks: [...base, stopsEqual(0), noStopMatching(/muse/i, 'museo'), proposalShown, guiMatchesState],
          },
          {
            say: 'Sì.',
            // Preferences may be saved at the request or at the confirming yes.
            checks: [...base, acceptedProposal, learned('shopping', 'shopping'), guiMatchesState],
          },
          {
            say: 'Aggiungine un altro, magari di dischi.',
            checks: [...base, proposalOrQuestion, stopsUnchanged, guiMatchesState],
          },
          {
            say: 'Sì, aggiungilo.',
            checks: [...base, stopsEqual(2), noList, guiMatchesState],
          },
          {
            say: 'Poi un caffè tranquillo vicino all’ultima tappa.',
            checks: [...base, proposalShown, stopsUnchanged, guiMatchesState],
          },
          {
            say: 'Perfetto, sì.',
            checks: [...base, acceptedProposal, stopsEqual(3), guiMatchesState],
          },
          {
            say: 'Togli la seconda tappa, non ho tempo per tutto.',
            checks: [...base, stopsRemoved(1), guiMatchesState],
          },
          {
            say: 'Sposta tutto di mezz’ora più tardi.',
            checks: [...base, timesShiftedBy(30), guiMatchesState],
          },
        ],
      },
      {
        title: 'Sessione 2 · il giorno dopo',
        steps: [
          {
            say: 'Oggi ho di nuovo voglia di fare shopping.',
            checks: [...base, learnedStillThere('shopping', 'shopping'), proposalShown, noList, guiMatchesState],
          },
          {
            say: 'Sì.',
            checks: [...base, acceptedProposal, guiMatchesState],
          },
          {
            say: 'Basta così per oggi.',
            checks: [...base, stopsEqual(1), noProposal, guiMatchesState],
          },
        ],
      },
    ],
  },
  {
    id: 'dinner-second-thoughts',
    title: 'Cena e serata con ripensamenti',
    description: 'Pizzeria accettata, serata scelta da Cicero, poi la pizzeria viene sostituita e la serata cancellata. Una settimana dopo "come al solito", poi cambia idea.',
    sessions: [
      {
        title: 'Sessione 1 · stasera',
        steps: [
          {
            say: 'Stasera vorrei cenare fuori e poi fare qualcosa.',
            checks: [...base, proposalOrQuestion, noList, stopsEqual(0), guiMatchesState],
          },
          {
            say: 'Una pizzeria, per favore.',
            checks: [...base, proposalShown, stopsEqual(0), guiMatchesState],
          },
          {
            say: 'Sì.',
            checks: [...base, acceptedProposal, learnedMatches('restaurant', /pizz/i, 'pizzeria'), guiMatchesState],
          },
          {
            say: 'Per dopo cena qualcosa con musica dal vivo: scegli tu e aggiungilo direttamente.',
            checks: [...base, stopsGrewBy(1), stopsUnchanged, guiMatchesState],
          },
          {
            say: 'Ripensandoci la pizzeria non mi convince: toglila e proponimi una trattoria.',
            checks: [...base, noStopMatching(/pizz/i, 'pizzeria'), proposalShown, guiMatchesState],
          },
          {
            say: 'Sì, va bene.',
            checks: [...base, acceptedProposal, stopsEqual(2), guiMatchesState],
          },
          {
            say: 'Alla fine niente serata, sono stanco: tieni solo la cena.',
            checks: [...base, stopsEqual(1), noStopMatching(/jazz|club|live|music|teatro/i, 'per la serata'), guiMatchesState],
          },
        ],
      },
      {
        title: 'Sessione 2 · una settimana dopo',
        steps: [
          {
            say: 'Ho voglia di cenare fuori anche stasera, come al solito.',
            checks: [...base, learnedStillThere('restaurant', 'ristoranti'), proposalShown, noList, guiMatchesState],
          },
          {
            say: 'No, stasera qualcosa di completamente diverso: sorprendimi.',
            checks: [...base, proposalShown, proposalChanged, guiMatchesState],
          },
          {
            say: 'Sì.',
            checks: [...base, acceptedProposal, guiMatchesState],
          },
        ],
      },
    ],
  },
  {
    id: 'full-day-cancellations',
    title: 'Giornata piena, un sì alla volta, poi cancella tutto',
    description: 'Cicero propone un monumento dopo l\'altro, poi pranzo e museo; l\'utente dice sì cinque volte, poi taglia, rimette, azzera e chiude con un caffè.',
    sessions: single('Sessione unica · giornata intera', [
      {
        say: 'Ho l’intera giornata. Vorrei tre monumenti, poi un pranzo veloce, poi un museo: proponi tu, una cosa alla volta.',
        checks: [...base, proposalShown, stopsEqual(0), noList, guiMatchesState],
      },
      { say: 'Sì.', checks: [...base, acceptedProposal, stopsEqual(1), guiMatchesState] },
      { say: 'Sì.', checks: [...base, acceptedProposal, stopsEqual(2), guiMatchesState] },
      { say: 'Sì.', checks: [...base, acceptedProposal, stopsEqual(3), guiMatchesState] },
      {
        say: 'Sì, e per pranzo va bene qualsiasi cosa veloce.',
        checks: [...base, stopsAtLeast(4), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Sì, aggiungilo.',
        checks: [...base, stopsAtLeast(5), stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Sono troppe. Togli il secondo e il terzo monumento.',
        checks: [...base, stopsRemoved(2), guiMatchesState],
      },
      {
        say: 'Però proponimi un monumento vicino al museo.',
        checks: [...base, proposalShown, stopsUnchanged, guiMatchesState],
      },
      {
        say: 'Sì.',
        checks: [...base, acceptedProposal, guiMatchesState],
      },
      {
        say: 'Cancella tutto e ricominciamo da zero.',
        // Emptying the plan may be followed by a fresh first proposal: that is the proactive style we want.
        checks: [...base, stopsEqual(0), noList, guiMatchesState],
      },
      {
        say: 'Solo un caffè: un espresso veloce al banco.',
        checks: [...base, proposalShown, guiMatchesState],
      },
    ]),
  },
];
