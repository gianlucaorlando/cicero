'use client';

import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { applyActions } from '@/lib/conversation-state';
import type { ChatContext, ChatMessage, ChatResponse, ChatRole, PlaceCandidate, ProfilePatch, Stop } from '@/lib/types';

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

  /** Sends one user turn. Resolves with the agent response, or null when the turn was rejected or failed. */
  const send = useCallback(async (text: string, context: TurnContext): Promise<ChatResponse | null> => {
    const value = text.trim();
    if (!value || thinking) return null;
    append('user', value);
    setThinking(true);

    try {
      const response = await api.chat({
        messages: [...messages.map(({ role, text: body }) => ({ role, text: body })), { role: 'user', text: value }],
        context: { ...context, itinerary, candidates },
      });

      setMode('ready');
      const actions = response.actions || [];
      const next = applyActions({ itinerary, candidates }, actions);
      setItinerary(next.itinerary);
      setCandidates(next.candidates);
      for (const action of actions) {
        if (action.type === 'update_profile') onProfilePatch(action.patch);
      }
      append('assistant', response.reply, response.meta);
      return response;
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
      return null;
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

  /** Back to the opening state: used by the hidden test panel between scenarios. */
  const reset = useCallback(() => {
    setMessages(initialMessages);
    setItinerary([]);
    setCandidates([]);
    nextId.current = initialMessages.length + 1;
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
    reset,
  };
}
