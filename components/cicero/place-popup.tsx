'use client';

import { Check, Info, Plus } from 'lucide-react';

import { placeTypeLabel } from '@/components/cicero/place-sheet';
import { Button } from '@/components/ui/button';
import { formatRating, humanReviewCount } from '@/lib/format';
import { humanDistance } from '@/lib/geo';
import { walkingMinutes } from '@/lib/route';
import type { PlaceCandidate } from '@/lib/types';

export type PopupAction = { label: string; kind: 'accept' | 'add'; onClick: () => void };

type Props = {
  place: PlaceCandidate;
  /** The one thing the user can do from here: accept the proposal, choose it, or add it. */
  primary: PopupAction | null;
  busy: boolean;
  /** Opens the extended sheet with everything known about the place. */
  onDetails: () => void;
};

/** The compact card that opens on the map when a pin is tapped. Details open on request. */
export function PlacePopup({ place, primary, busy, onDetails }: Props) {
  return (
    <section className="place-popup" aria-label={`Informazioni su ${place.name}`}>
      <small className="place-popup-kicker">{placeTypeLabel(place.primaryType)}</small>
      <strong className="place-popup-name">{place.name}</strong>
      <span className="place-popup-facts">
        {humanDistance(place.distanceMeters)} · {walkingMinutes(place.distanceMeters)} min a piedi
        {place.rating != null && (
          <> · ★ {formatRating(place.rating)}{place.userRatingCount ? ` (${humanReviewCount(place.userRatingCount)})` : ''}</>
        )}
      </span>
      <div className="place-popup-actions">
        {primary && (
          <Button type="button" size="sm" onClick={primary.onClick} disabled={busy}>
            {primary.kind === 'add' ? <Plus /> : <Check />} {primary.label}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={onDetails}>
          <Info /> Dettagli
        </Button>
      </div>
    </section>
  );
}
