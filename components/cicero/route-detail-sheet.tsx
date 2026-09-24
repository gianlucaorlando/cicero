'use client';

import { Bookmark, Check, ExternalLink, LocateFixed, LogIn, MapPin, Navigation, Undo2, X } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Auth0Status } from '@/hooks/use-auth0';
import type { StopRemoval } from '@/lib/conversation-state';
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
  onRemoveStop: (stopId: string) => void;
  /** The stop just taken out, shown in its old place with "Annulla" for a few seconds. */
  removed: StopRemoval | null;
  onUndo: () => void;
};

function saveLabel({ saved, saveStatus, authStatus }: Pick<Props, 'saved' | 'saveStatus' | 'authStatus'>) {
  if (saveStatus === 'saving') return { icon: <LocateFixed className="spin" />, text: 'Salvataggio…' };
  if (saved) return { icon: <Check />, text: 'Percorso salvato' };
  if (authStatus === 'anonymous') return { icon: <LogIn />, text: 'Accedi per salvare' };
  return { icon: <Bookmark />, text: saveStatus === 'error' ? 'Riprova a salvare' : 'Salva percorso' };
}

export function RouteDetailSheet({
  open, onOpenChange, itinerary, coords, city, locationLabel, saved, saveStatus, authStatus, onSave, onRemoveStop, removed, onUndo,
}: Props) {
  const googleMapsUrl = googleMapsRouteUrl(coords, itinerary);
  const label = saveLabel({ saved, saveStatus, authStatus });

  const rows = itinerary.map((stop, index) => {
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
        <div className="route-detail-stop-actions">
          {/* A fixed slot for each icon keeps them in the same column on every row. */}
          {stop.googleMapsUri ? (
            <a href={stop.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri i dettagli di ${stop.title} su Google Maps`}>
              <ExternalLink />
            </a>
          ) : <span className="route-detail-action-slot" aria-hidden="true" />}
          <button className="route-detail-remove" type="button" onClick={() => onRemoveStop(stop.id)} aria-label={`Togli ${stop.title} dal percorso`} title={`Togli ${stop.title}`}>
            <X />
          </button>
        </div>
      </li>
    );
  });
  if (removed) {
    rows.splice(Math.min(removed.index, rows.length), 0, (
      <li key={`removed-${removed.stop.id}`} className="route-detail-removed">
        <output>Hai tolto <strong>{removed.stop.title}</strong></output>
        <button type="button" onClick={onUndo}><Undo2 /> Annulla</button>
      </li>
    ));
  }

  return (
    <Sheet open={open && (itinerary.length > 0 || removed !== null)} onOpenChange={onOpenChange}>
      <SheetContent className="route-detail-sheet" side="bottom">
        <SheetHeader>
          <p className="sheet-kicker">Il tuo percorso</p>
          <SheetTitle>{itinerary.length ? `Partenza + ${pluralStops(itinerary.length)}` : 'Percorso vuoto'}</SheetTitle>
          <SheetDescription>Le tappe scelte, nell’ordine in cui le visiterai. Tocca × per toglierne una.</SheetDescription>
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
            {rows}
          </ol>
        </div>

        <div className="route-actions">
          <button className={`route-save-button ${saved ? 'saved' : ''}`} type="button" onClick={onSave} disabled={saveStatus === 'saving' || saved || !itinerary.length}>
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
