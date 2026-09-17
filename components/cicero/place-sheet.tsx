'use client';

import { Check, ExternalLink, LocateFixed, MapPin, RefreshCw, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatRating, humanReviewCount } from '@/lib/format';
import { humanDistance } from '@/lib/geo';
import type { PlaceCandidate } from '@/lib/types';

/** Rough walking pace, the same one the itinerary card uses for its estimate. */
const WALKING_METERS_PER_MINUTE = 80;

const TYPE_LABELS: Record<string, string> = {
  bakery: 'Panetteria',
  bar: 'Bar',
  cafe: 'Caffè',
  church: 'Chiesa',
  clothing_store: 'Abbigliamento',
  coffee_shop: 'Caffetteria',
  art_gallery: 'Galleria d’arte',
  historical_landmark: 'Luogo storico',
  history_museum: 'Museo di storia',
  ice_cream_shop: 'Gelateria',
  italian_restaurant: 'Ristorante italiano',
  market: 'Mercato',
  monument: 'Monumento',
  museum: 'Museo',
  night_club: 'Locale notturno',
  park: 'Parco',
  pizza_restaurant: 'Pizzeria',
  point_of_interest: 'Luogo di interesse',
  restaurant: 'Ristorante',
  store: 'Negozio',
  tourist_attraction: 'Attrazione turistica',
  wine_bar: 'Enoteca',
};

export function placeTypeLabel(primaryType: string) {
  if (TYPE_LABELS[primaryType]) return TYPE_LABELS[primaryType];
  const cleaned = primaryType.replace(/_/g, ' ').trim();
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase('it') + cleaned.slice(1) : 'Luogo';
}

export function walkingMinutes(distanceMeters: number) {
  return Math.max(1, Math.round(distanceMeters / WALKING_METERS_PER_MINUTE));
}

type Props = {
  place: PlaceCandidate | null;
  /** Cicero's one-line reason, shown only when the open place is the one being proposed. */
  reason?: string;
  /** Present when the place is the pending proposal: the sheet can then accept or refuse it. */
  actions?: { onAccept: () => void; onDecline: () => void };
  busy: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Everything known about one place, opened by tapping the proposal. No extra API call. */
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
                {place.tripadvisor && (
                  <span>
                    <small>Tripadvisor</small>
                    <strong>
                      {/* Tripadvisor's terms require showing their rating image unmodified. */}
                      {/* oxlint-disable-next-line next/no-img-element */}
                      <img src={place.tripadvisor.ratingImageUrl} alt={`Tripadvisor ${formatRating(place.tripadvisor.rating)} su 5`} />
                      {humanReviewCount(place.tripadvisor.reviewCount)} recensioni
                    </strong>
                  </span>
                )}
                {place.businessStatus && place.businessStatus !== 'OPERATIONAL' && (
                  <span>
                    <small>Attenzione</small>
                    <strong>{place.businessStatus === 'CLOSED_TEMPORARILY' ? 'Chiuso temporaneamente' : 'Risulta chiuso definitivamente'}</strong>
                  </span>
                )}
              </div>

              <p className="place-sheet-note">
                Orari e informazioni arrivano da Google Places e possono cambiare. Per gli orari di oggi apri la scheda su Maps.
              </p>

              <div className="place-sheet-links">
                {place.googleMapsUri && (
                  <a href={place.googleMapsUri} target="_blank" rel="noreferrer">
                    <MapPin /> Apri su Google Maps <ExternalLink />
                  </a>
                )}
                {place.tripadvisor && (
                  <a href={place.tripadvisor.webUrl} target="_blank" rel="noreferrer">
                    Leggi le recensioni su Tripadvisor <ExternalLink />
                  </a>
                )}
              </div>
            </div>

            {actions && (
              <div className="place-sheet-actions">
                <Button type="button" size="sm" onClick={actions.onAccept} disabled={busy}>
                  {busy ? <LocateFixed className="spin" /> : <Check />} Sì, aggiungila
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={actions.onDecline} disabled={busy}>
                  <RefreshCw /> Un’altra
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
