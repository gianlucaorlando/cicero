'use client';

import { ExternalLink, Undo2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StopRemoval } from '@/lib/conversation-state';
import { pluralStops } from '@/lib/format';
import { estimatedDuration } from '@/lib/route';
import type { LatLng, Stop } from '@/lib/types';

type Props = {
  origin: LatLng;
  stops: Stop[];
  onRemove: (stopId: string) => void;
  /** The stop just taken out, shown in its old place with "Annulla" for a few seconds. */
  removed: StopRemoval | null;
  onUndo: () => void;
};

export function ItineraryCard({ origin, stops, onRemove, removed, onUndo }: Props) {
  const rows = stops.map((stop, index) => (
    <li key={stop.id}>
      <time>{stop.time}</time>
      <span className="stop-icon">{index + 1}</span>
      <div>
        {stop.googleMapsUri
          ? <a href={stop.googleMapsUri} target="_blank" rel="noreferrer"><strong>{stop.title}</strong><ExternalLink /></a>
          : <strong>{stop.title}</strong>}
        <span>{stop.detail}</span>
      </div>
      <Button className="stop-remove" type="button" variant="ghost" size="icon" onClick={() => onRemove(stop.id)} aria-label={`Rimuovi ${stop.title} dall’itinerario`} title={`Rimuovi ${stop.title}`}>
        <X />
      </Button>
    </li>
  ));
  if (removed) {
    rows.splice(Math.min(removed.index, rows.length), 0, (
      <li key={`removed-${removed.stop.id}`} className="stop-removed">
        <output>Hai tolto <strong>{removed.stop.title}</strong></output>
        <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
          <Undo2 /> Annulla
        </Button>
      </li>
    ));
  }

  return (
    <article className="itinerary-card" aria-label="Itinerario corrente">
      <div className="itinerary-title">
        <div>
          <span>Tappe del percorso</span>
          <strong>{stops.length ? `${pluralStops(stops.length)} in ordine · ${estimatedDuration(origin, stops)}` : 'Nessuna tappa'}</strong>
        </div>
        <Badge variant="outline">live</Badge>
      </div>
      <ol>{rows}</ol>
      <p className="google-attribution itinerary-attribution">Dati luogo forniti da <strong>Google Maps</strong> · verificati all’inserimento</p>
    </article>
  );
}
