'use client';

import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { shiftTime } from '@/lib/format';
import type { ChatAction, ChatContext, ChatMessage, ChatRole, PlaceCandidate, ProfilePatch, Stop } from '@/lib/types';

export type ChatMode = 'unknown' | 'ready' | 'missing' | 'error';

export type TurnContext = Omit<ChatContext, 'itinerary' | 'candidates'>;

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Vuoi che ti proponga un itinerario basato sulle tue indicazioni, sulla posizione e sul tempo che hai a disposizione?',
    meta: 'Userò solo luoghi verificati',
  },
];

function applyActionsToItinerary(current: Stop[], actions: ChatAction[]) {
  return actions.reduce((stops, action) => {
    switch (action.type) {
      case 'add_stops': {
        const known = new Set(stops.map((stop) => stop.placeId || stop.id));
        return [...stops, ...action.stops.filter((stop) => !known.has(stop.placeId || stop.id))];
      }
      case 'remove_stops':
        return stops.filter((stop) => !action.stopIds.includes(stop.id));
      case 'shift_times':
        return stops.map((stop) => ({ ...stop, time: shiftTime(stop.time, action.minutes) }));
      default:
        return stops;
    }
  }, current);
}

/**
 * Owns the chat transcript, the itinerary and the candidate pins. Every user
 * turn goes to the server-side agent, whose actions are applied here.
 */
export function useConversation(onProfilePatch: (patch: ProfilePatch) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [itinerary, setItinerary] = useState<Stop[]>([]);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<ChatMode>('unknown');
  const nextId = useRef(initialMessages.length + 1);

  const append = useCallback((role: ChatRole, text: string, meta?: string) => {
    const item: ChatMessage = { id: nextId.current++, role, text, meta };
    setMessages((current) => [...current, item]);
  }, []);

  const notify = useCallback((text: string, meta?: string) => append('assistant', text, meta), [append]);

  const send = useCallback(async (text: string, context: TurnContext) => {
    const value = text.trim();
    if (!value || thinking) return;
    append('user', value);
    setThinking(true);

    try {
      const response = await api.chat({
        messages: [...messages.map(({ role, text: body }) => ({ role, text: body })), { role: 'user', text: value }],
        context: { ...context, itinerary, candidates },
      });

      setMode('ready');
      const actions = response.actions || [];
      setItinerary((current) => applyActionsToItinerary(current, actions));
      const lastSearch = [...actions].reverse().find((action) => action.type === 'show_candidates');
      if (lastSearch && lastSearch.type === 'show_candidates') setCandidates(lastSearch.candidates);
      if (actions.some((action) => action.type === 'add_stops') && !lastSearch) setCandidates([]);
      for (const action of actions) {
        if (action.type === 'update_profile') onProfilePatch(action.patch);
      }
      append('assistant', response.reply, response.meta);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LLM_NOT_CONFIGURED') {
        setMode('missing');
        append('assistant', 'Il modello non è ancora collegato su questo server: manca la chiave. Finché non è attiva non posso proporre tappe.', 'Nessun luogo generato');
      } else if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        append('assistant', error.message, 'Limite temporaneo');
      } else {
        setMode('error');
        append('assistant', 'Non riesco a raggiungere il modello in questo momento. Il tuo itinerario resta invariato.', 'Errore di connessione');
      }
    } finally {
      setThinking(false);
    }
  }, [append, candidates, itinerary, messages, onProfilePatch, thinking]);

  const removeStop = useCallback((stopId: string) => {
    setItinerary((current) => current.filter((stop) => stop.id !== stopId));
  }, []);

  const replaceItinerary = useCallback((stops: Stop[]) => {
    setItinerary(stops);
    setCandidates([]);
  }, []);

  return {
    messages,
    itinerary,
    candidates,
    thinking,
    mode,
    awaitingConsent: messages.length === initialMessages.length,
    append,
    notify,
    send,
    removeStop,
    replaceItinerary,
  };
}
