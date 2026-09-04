'use client';

import { Bookmark, Check, ExternalLink, LocateFixed, LogIn, MapPin, Navigation } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Auth0Status } from '@/hooks/use-auth0';
import { pluralStops } from '@/lib/format';
import { distanceMeters, googleMapsRouteUrl, humanDistance, itineraryDistance } from '@/lib/geo';
import type { LatLng, Stop } from '@/lib/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itinerary: Stop[];
  coords: LatLng;
  city: string;
  locationLabel: string;
  saved: boolean;
  saveStatus: 'error' | 'idle' | 'saving';
  authStatus: Auth0Status;
  onSave: () => void;
};

function saveLabel({ saved, saveStatus, authStatus }: Pick<Props, 'saved' | 'saveStatus' | 'authStatus'>) {
  if (saveStatus === 'saving') return { icon: <LocateFixed className="spin" />, text: 'Salvataggio…' };
  if (saved) return { icon: <Check />, text: 'Percorso salvato' };
  if (authStatus === 'anonymous') return { icon: <LogIn />, text: 'Accedi per salvare' };
  return { icon: <Bookmark />, text: saveStatus === 'error' ? 'Riprova a salvare' : 'Salva percorso' };
}

export function RouteDetailSheet({ open, onOpenChange, itinerary, coords, city, locationLabel, saved, saveStatus, authStatus, onSave }: Props) {
  const googleMapsUrl = googleMapsRouteUrl(coords, itinerary);
  const label = saveLabel({ saved, saveStatus, authStatus });

  return (
    <Sheet open={open && itinerary.length > 0} onOpenChange={onOpenChange}>
      <SheetContent className="route-detail-sheet" side="bottom">
        <SheetHeader>
          <p className="sheet-kicker">Il tuo percorso</p>
          <SheetTitle>Partenza + {pluralStops(itinerary.length)}</SheetTitle>
          <SheetDescription>Le tappe scelte, nell’ordine in cui le visiterai.</SheetDescription>
        </SheetHeader>

        <div className="route-detail-scroll">
          <div className="route-detail-stats" aria-label="Riepilogo del percorso">
            <span><small>Partenza</small><strong>{locationLabel}</strong></span>
            <span><small>Distanza</small><strong>{humanDistance(itineraryDistance(coords, itinerary))}</strong></span>
            <span><small>Spostamento</small><strong>A piedi</strong></span>
          </div>

          <ol className="route-detail-list">
            <li className="route-detail-origin">
              <span className="route-detail-marker"><MapPin /></span>
              <div><small>Partenza</small><strong>{locationLabel}</strong><span>{city}</span></div>
            </li>
            {itinerary.map((stop, index) => {
              const previous = index === 0 ? coords : itinerary[index - 1];
              return (
                <li key={stop.id}>
                  <span className="route-detail-marker">{index + 1}</span>
                  <div>
                    <small>{stop.time} · {humanDistance(distanceMeters(previous, stop))} dalla tappa precedente</small>
                    <strong>{stop.title}</strong>
                    <span>{stop.address || stop.detail}</span>
                    <em>{stop.detail}</em>
                  </div>
                  {stop.googleMapsUri && (
                    <a href={stop.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri i dettagli di ${stop.title} su Google Maps`}>
                      <ExternalLink />
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="route-actions">
          <button className={`route-save-button ${saved ? 'saved' : ''}`} type="button" onClick={onSave} disabled={saveStatus === 'saving' || saved}>
            {label.icon}
            {label.text}
          </button>
          {googleMapsUrl && (
            <div className="route-export">
              <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                <Navigation /> Apri il percorso in Google Maps <ExternalLink />
              </a>
              <small>Google Maps ricalcolerà percorso pedonale, tempi e aperture nell’app.</small>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
