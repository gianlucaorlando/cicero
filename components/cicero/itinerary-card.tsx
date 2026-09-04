'use client';

import { ExternalLink, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pluralStops } from '@/lib/format';
import { itineraryDistance } from '@/lib/geo';
import type { LatLng, Stop } from '@/lib/types';

const MINUTES_PER_STOP = 45;
const WALKING_METERS_PER_MINUTE = 80;

export function estimatedDuration(origin: LatLng, stops: Stop[]) {
  const minutes = stops.length * MINUTES_PER_STOP + Math.round(itineraryDistance(origin, stops) / WALKING_METERS_PER_MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `circa ${rest} min`;
  return rest ? `circa ${hours} h ${rest} min` : `circa ${hours} h`;
}

type Props = {
  origin: LatLng;
  stops: Stop[];
  onRemove: (stopId: string) => void;
};

export function ItineraryCard({ origin, stops, onRemove }: Props) {
  return (
    <article className="itinerary-card" aria-label="Itinerario corrente">
      <div className="itinerary-title">
        <div><span>Tappe del percorso</span><strong>{pluralStops(stops.length)} in ordine · {estimatedDuration(origin, stops)}</strong></div>
        <Badge variant="outline">live</Badge>
      </div>
      <ol>
        {stops.map((stop, index) => (
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
        ))}
      </ol>
      <p className="google-attribution itinerary-attribution">Dati luogo forniti da <strong>Google Maps</strong> · verificati all’inserimento</p>
    </article>
  );
}
