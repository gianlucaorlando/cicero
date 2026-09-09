'use client';

import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { applyActions, emptyPlan, type PlanState } from '@/lib/conversation-state';
import type { ChatContext, ChatMessage, ChatResponse, ChatRole, ProfilePatch, Stop } from '@/lib/types';

export type ChatMode = 'unknown' | 'ready' | 'missing' | 'error';

export type TurnContext = Omit<ChatContext, 'itinerary' | 'candidates' | 'proposing'>;

export type SendOptions = {
  /** App-generated event: sent to the model as a user turn, never shown in the chat. */
  hidden?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Ciao, sono Cicero: ti propongo io da dove partire, tu dici solo sì o no.',
    meta: 'Userò solo luoghi verificati',
  },
];

/** Quick replies for the opening turn, used until the agent has spoken (or if the opening move fails). */
export const initialSuggestions = [
  'Proponimi qualcosa',
  'Ho un paio d’ore',
  'Solo un caffè qui vicino',
  'Voglio fare shopping',
];

/** The hidden event that asks Cicero to make the first move as soon as the page opens. */
export const OPENING_EVENT = 'Evento: l’utente ha appena aperto l’app e non ha ancora scritto nulla. Fai la prima mossa: proponi subito una tappa adatta a ora, meteo, punto di partenza e profilo, e chiedi se va bene o quanto tempo ha.';

export function relocationEvent(label: string, city: string) {
  return `Evento: l’utente ha spostato il punto di partenza su ${label} (${city}). Le tappe già scelte restano. Prendine atto in poche parole e proponi subito una tappa adatta vicino al nuovo punto, a meno che l’itinerario non sia già completo.`;
}

/**
 * Owns the chat transcript, the itinerary, the current proposal and the quick
 * replies. Every user turn goes to the server-side agent, whose actions are
 * applied here.
 */
export function useConversation(onProfilePatch: (patch: ProfilePatch) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [plan, setPlan] = useState<PlanState>({ ...emptyPlan, suggestions: initialSuggestions });
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<ChatMode>('unknown');
  const [started, setStarted] = useState(false);
  const nextId = useRef(initialMessages.length + 1);

  const append = useCallback((role: ChatRole, text: string, meta?: string, hidden = false) => {
    const item: ChatMessage = { id: nextId.current++, role, text, meta, hidden: hidden || undefined };
    setMessages((current) => [...current, item]);
  }, []);

  const notify = useCallback((text: string, meta?: string) => append('assistant', text, meta), [append]);

  /** Sends one user turn. Resolves with the agent response, or null when the turn was rejected or failed. */
  const send = useCallback(async (text: string, context: TurnContext, options: SendOptions = {}): Promise<ChatResponse | null> => {
    const value = text.trim();
    if (!value || thinking) return null;
    append('user', value, undefined, options.hidden);
    setThinking(true);
    setStarted(true);
    setPlan((current) => ({ ...current, suggestions: [] }));

    try {
      const response = await api.chat({
        messages: [...messages.map(({ role, text: body }) => ({ role, text: body })), { role: 'user', text: value }],
        context: { ...context, itinerary: plan.itinerary, candidates: plan.candidates, proposing: plan.proposal !== null },
      });

      setMode('ready');
      const actions = response.actions || [];
      setPlan((current) => applyActions({ ...current, suggestions: [] }, actions));
      for (const action of actions) {
        if (action.type === 'update_profile') onProfilePatch(action.patch);
      }
      append('assistant', response.reply, response.meta);
      return response;
    } catch (error) {
      if (options.hidden) {
        // An app-generated event that fails should not read as an error to the user: fall back to the manual start.
        setPlan((current) => ({ ...current, suggestions: initialSuggestions }));
      }
      if (error instanceof ApiError && error.code === 'LLM_NOT_CONFIGURED') {
        setMode('missing');
        append('assistant', 'Il modello non è ancora collegato su questo server: manca la chiave. Finché non è attiva non posso proporre tappe.', 'Nessun luogo generato');
      } else if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        append('assistant', error.message, 'Limite temporaneo');
      } else if (!options.hidden) {
        setMode('error');
        append('assistant', 'Non riesco a raggiungere il modello in questo momento. Il tuo itinerario resta invariato.', 'Errore di connessione');
      } else {
        setMode('error');
      }
      return null;
    } finally {
      setThinking(false);
    }
  }, [append, messages, onProfilePatch, plan, thinking]);

  /** Cicero's opening move: a hidden event that makes it propose before the user types anything. */
  const start = useCallback((context: TurnContext) => {
    if (started) return Promise.resolve(null);
    return send(OPENING_EVENT, context, { hidden: true });
  }, [send, started]);

  const removeStop = useCallback((stopId: string) => {
    setPlan((current) => ({ ...current, itinerary: current.itinerary.filter((stop) => stop.id !== stopId) }));
  }, []);

  const replaceItinerary = useCallback((stops: Stop[]) => {
    setPlan((current) => ({ ...current, itinerary: stops, candidates: [], proposal: null }));
  }, []);

  /** Back to the opening state: used by the hidden test panel between scenarios. */
  const reset = useCallback(() => {
    setMessages(initialMessages);
    setPlan({ ...emptyPlan, suggestions: initialSuggestions });
    setStarted(false);
    nextId.current = initialMessages.length + 1;
  }, []);

  return {
    messages,
    itinerary: plan.itinerary,
    candidates: plan.candidates,
    proposal: plan.proposal,
    suggestions: plan.suggestions,
    thinking,
    mode,
    started,
    append,
    notify,
    send,
    start,
    removeStop,
    replaceItinerary,
    reset,
  };
}
