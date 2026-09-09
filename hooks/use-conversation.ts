'use client';

import { useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { applyActions, emptyPlan, type PlanState } from '@/lib/conversation-state';
import type { ChatContext, ChatMessage, ChatResponse, ChatRole, ProfilePatch, Stop } from '@/lib/types';

export type ChatMode = 'unknown' | 'ready' | 'missing' | 'error';

export type TurnContext = Omit<ChatContext, 'itinerary' | 'candidates' | 'proposing'>;

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    text: 'Ciao, sono Cicero. Dimmi quanto tempo hai e ti propongo io da dove partire: una tappa alla volta, tu dici solo sì o no.',
    meta: 'Userò solo luoghi verificati',
  },
];

/** Quick replies for the opening turn, before the agent has spoken. */
export const initialSuggestions = [
  'Ho un paio d’ore, fai tu',
  'Ho tutto il giorno',
  'Solo un caffè qui vicino',
  'Voglio fare shopping',
];

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
  }, [append, messages, onProfilePatch, plan, thinking]);

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
    append,
    notify,
    send,
    removeStop,
    replaceItinerary,
    reset,
  };
}
