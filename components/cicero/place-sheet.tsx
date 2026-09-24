'use client';

import { Check, ExternalLink, LocateFixed, MapPin, RefreshCw, Star } from 'lucide-react';

import { PlaceReviewsSection } from '@/components/cicero/place-reviews';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatRating, humanReviewCount } from '@/lib/format';
import { humanDistance } from '@/lib/geo';
import { placeTypeLabel } from '@/lib/place-labels';
import { walkingMinutes } from '@/lib/route';
import type { PlaceCandidate } from '@/lib/types';

type Props = {
  place: PlaceCandidate | null;
  /** Cicerone's one-line reason, shown only when the open place is the one being proposed. */
  reason?: string;
  /**
   * What the user can do from the sheet: accept the pending proposal (with an
   * optional "another one"), or choose an option shown on the map or in the list.
   */
  actions?: { acceptLabel: string; onAccept: () => void; onDecline?: () => void; declineLabel?: string };
  busy: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Everything known about one place, opened on request; its latest reviews load when it opens. */
export function PlaceSheet({ place, reason, actions, busy, onOpenChange }: Props) {
  return (
    <Sheet open={place !== null} onOpenChange={onOpenChange}>
      <SheetContent className="place-sheet" side="bottom">
        {place && (
          <>
            <SheetHeader>
              <p className="sheet-kicker">{placeTypeLabel(place.primaryType)}</p>
              <SheetTitle>{place.name}</SheetTitle>
              <SheetDescription>
                {humanDistance(place.distanceMeters)} a piedi, circa {walkingMinutes(place.distanceMeters)} minuti dal punto di partenza.
              </SheetDescription>
            </SheetHeader>

            <div className="place-sheet-body">
              {reason && <p className="place-sheet-reason">{reason}</p>}

              <div className="place-sheet-facts">
                <span>
                  <small>Indirizzo</small>
                  <strong>{place.address || 'non disponibile'}</strong>
                </span>
                {place.rating != null && (
                  <span>
                    <small>Google</small>
                    <strong><Star aria-hidden="true" /> {formatRating(place.rating)} su {humanReviewCount(place.userRatingCount || 0)} recensioni</strong>
                  </span>
                )}
                {place.businessStatus && place.businessStatus !== 'OPERATIONAL' && (
                  <span>
                    <small>Attenzione</small>
                    <strong>{place.businessStatus === 'CLOSED_TEMPORARILY' ? 'Chiuso temporaneamente' : 'Risulta chiuso definitivamente'}</strong>
                  </span>
                )}
              </div>

              <PlaceReviewsSection placeId={place.id} />

              <p className="place-sheet-note">
                Orari e informazioni arrivano da Google Places e possono cambiare. Per gli orari di oggi apri la scheda su Maps.
              </p>

              <div className="place-sheet-links">
                {place.googleMapsUri && (
                  <a href={place.googleMapsUri} target="_blank" rel="noreferrer">
                    <MapPin /> Apri su Google Maps <ExternalLink />
                  </a>
                )}
              </div>
            </div>

            {actions && (
              <div className="place-sheet-actions">
                <Button type="button" size="sm" onClick={actions.onAccept} disabled={busy}>
                  {busy ? <LocateFixed className="spin" /> : <Check />} {actions.acceptLabel}
                </Button>
                {actions.onDecline && (
                  <Button type="button" size="sm" variant="outline" onClick={actions.onDecline} disabled={busy}>
                    <RefreshCw /> {actions.declineLabel ?? 'Un’altra'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
