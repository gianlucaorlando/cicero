'use client';

import { ExternalLink, LocateFixed } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { candidateLetter, formatRating, humanReviewCount } from '@/lib/format';
import { humanDistance } from '@/lib/geo';
import type { PlaceCandidate } from '@/lib/types';

type Props = {
  candidates: PlaceCandidate[];
  disabled: boolean;
  onSelect: (candidate: PlaceCandidate) => void;
  /** Letters continue from this index (used when listing alternatives under a proposal). */
  letterOffset?: number;
  title?: string;
};

export function PlacesCard({ candidates, disabled, onSelect, letterOffset = 0, title = 'Scegli una tappa' }: Props) {
  return (
    <article className="places-card" aria-label="Luoghi verificati e recensioni disponibili">
      <div className="places-card-head">
        <div><span>Vicino al punto scelto</span><strong>{title}</strong></div>
        <Badge variant="outline">live</Badge>
      </div>
      <div className="place-options">
        {candidates.map((place, index) => (
          <div className="place-option" key={place.id}>
            <button type="button" onClick={() => onSelect(place)} disabled={disabled}>
              <span className="place-map-index" aria-hidden="true">{candidateLetter(index + letterOffset)}</span>
              <span className="place-option-copy">
                <strong>{place.name}</strong>
                <small>{humanDistance(place.distanceMeters)} · {place.address}</small>
                <span className="place-review-summary">
                  {place.rating != null && place.userRatingCount != null && (
                    <span className="google-review">★ {formatRating(place.rating)} · {humanReviewCount(place.userRatingCount)} su Google</span>
                  )}
                  {place.tripadvisor && (
                    <span className="tripadvisor-review">
                      {/* Tripadvisor's terms require showing their rating image unmodified. */}
                      {/* oxlint-disable-next-line next/no-img-element */}
                      <img src={place.tripadvisor.ratingImageUrl} alt={`Tripadvisor ${formatRating(place.tripadvisor.rating)} su 5`} />
                      <span>{humanReviewCount(place.tripadvisor.reviewCount)} recensioni</span>
                    </span>
                  )}
                </span>
              </span>
              <span className="place-add">{disabled ? <LocateFixed className="spin" /> : '+'}</span>
            </button>
            <span className="place-source-links">
              {place.googleMapsUri && (
                <a href={place.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri ${place.name} su Google Maps`}>
                  <ExternalLink />
                </a>
              )}
              {place.tripadvisor && (
                <a href={place.tripadvisor.webUrl} target="_blank" rel="noreferrer" aria-label={`Leggi le recensioni di ${place.name} su Tripadvisor`}>
                  Trip
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="google-attribution">
        Dati luogo forniti da <strong>Google Maps</strong>
        {candidates.some((place) => place.tripadvisor) && <> · valutazioni <strong>Tripadvisor</strong></>}
      </p>
    </article>
  );
}
