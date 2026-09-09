'use client';

import { Check, ChevronDown, ChevronUp, ExternalLink, LocateFixed, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRating, humanReviewCount } from '@/lib/format';
import { humanDistance } from '@/lib/geo';
import type { Proposal } from '@/lib/types';

type Props = {
  proposal: Proposal;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
  alternativesOpen: boolean;
  onToggleAlternatives: () => void;
};

/** A single suggestion the user can accept or refuse with one tap. */
export function ProposalCard({ proposal, disabled, onAccept, onDecline, alternativesOpen, onToggleAlternatives }: Props) {
  const { candidate, reason, alternatives } = proposal;

  return (
    <article className="proposal-card" aria-label={`Proposta: ${candidate.name}`}>
      <div className="proposal-head">
        <span>Ti propongo</span>
        <Badge variant="outline">verificato</Badge>
      </div>
      <strong className="proposal-name">{candidate.name}</strong>
      <small className="proposal-facts">
        {humanDistance(candidate.distanceMeters)} · {candidate.address}
        {candidate.rating != null && candidate.userRatingCount != null && (
          <> · ★ {formatRating(candidate.rating)} ({humanReviewCount(candidate.userRatingCount)})</>
        )}
      </small>
      {reason && <p className="proposal-reason">{reason}</p>}

      <div className="proposal-actions">
        <Button type="button" size="sm" onClick={onAccept} disabled={disabled}>
          {disabled ? <LocateFixed className="spin" /> : <Check />} Sì, aggiungila
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDecline} disabled={disabled}>
          <RefreshCw /> Un’altra
        </Button>
        {candidate.googleMapsUri && (
          <a className="proposal-link" href={candidate.googleMapsUri} target="_blank" rel="noreferrer" aria-label={`Apri ${candidate.name} su Google Maps`}>
            <ExternalLink />
          </a>
        )}
      </div>

      {alternatives.length > 0 && (
        <button className="proposal-alternatives-toggle" type="button" onClick={onToggleAlternatives} aria-expanded={alternativesOpen}>
          {alternativesOpen ? <ChevronUp /> : <ChevronDown />}
          {alternativesOpen ? 'Nascondi le altre opzioni' : `Vedi le altre ${alternatives.length} opzioni`}
        </button>
      )}
    </article>
  );
}
