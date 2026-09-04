'use client';

import { useEffect, useRef, type SubmitEvent } from 'react';
import { Check, Mic, Send, SlidersHorizontal, Sparkles } from 'lucide-react';

import { ItineraryCard } from '@/components/cicero/itinerary-card';
import { PlacesCard } from '@/components/cicero/places-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChatMessage, LatLng, PlaceCandidate, Stop } from '@/lib/types';

export type QuickPrompt = { label: string; text: string };

type Props = {
  mapOpen: boolean;
  onToggleMap: () => void;
  city: string;
  origin: LatLng;
  preferenceCount: number;
  onOpenProfile: () => void;
  messages: ChatMessage[];
  thinking: boolean;
  candidates: PlaceCandidate[];
  onSelectCandidate: (candidate: PlaceCandidate) => void;
  itinerary: Stop[];
  onRemoveStop: (stopId: string) => void;
  quickPrompts: QuickPrompt[];
  onQuickPrompt: (text: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  speech: { supported: boolean; listening: boolean; toggle: () => void };
  footerNote: string;
};

export function ConversationPanel({
  mapOpen,
  onToggleMap,
  city,
  origin,
  preferenceCount,
  onOpenProfile,
  messages,
  thinking,
  candidates,
  onSelectCandidate,
  itinerary,
  onRemoveStop,
  quickPrompts,
  onQuickPrompt,
  input,
  onInputChange,
  onSubmit,
  speech,
  footerNote,
}: Props) {
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, thinking, candidates]);

  return (
    <section className="conversation" aria-label="Conversazione con Cicero">
      <button className="drag-handle-button" type="button" onClick={onToggleMap} aria-label={mapOpen ? 'Espandi la conversazione' : 'Mostra la mappa'}>
        <span className="drag-handle" />
      </button>

      <div className="conversation-head">
        <div>
          <p className="eyebrow">Oggi a {city}</p>
          <h1>{itinerary.length ? 'Il tuo percorso, mentre ne parliamo.' : 'Parliamo. Al percorso penso io.'}</h1>
        </div>
        <Button className="memory-button" variant="outline" size="sm" onClick={onOpenProfile}>
          <SlidersHorizontal /> {preferenceCount} preferenze
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

        {candidates.length > 0 && <PlacesCard candidates={candidates} disabled={thinking} onSelect={onSelectCandidate} />}
        {itinerary.length > 0 && <ItineraryCard origin={origin} stops={itinerary} onRemove={onRemoveStop} />}

        {thinking && (
          <article className="message assistant-message thinking-message">
            <span className="assistant-avatar"><Sparkles /></span>
            <div className="thinking-dots"><i /><i /><i /></div>
          </article>
        )}
        <div ref={messagesEnd} />
      </div>

      <div className="quick-prompts" aria-label="Suggerimenti rapidi">
        {quickPrompts.map((prompt) => (
          <button type="button" key={prompt.label} onClick={() => onQuickPrompt(prompt.text)} disabled={thinking}>{prompt.label}</button>
        ))}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        {speech.supported && (
          <Button
            className={`mic-button ${speech.listening ? 'listening' : ''}`}
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={speech.listening ? 'Interrompi la dettatura' : 'Parla con Cicero'}
            aria-pressed={speech.listening}
            onClick={speech.toggle}
          >
            <Mic />
          </Button>
        )}
        <Input
          className="composer-input"
          aria-label="Messaggio"
          placeholder={speech.listening ? 'Ti ascolto…' : 'Chiedi o cambia il programma…'}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <Button className="send-button" type="submit" size="icon-lg" aria-label="Invia messaggio" disabled={!input.trim() || thinking}>
          <Send />
        </Button>
      </form>
      <p className="demo-note">{footerNote}</p>
    </section>
  );
}
