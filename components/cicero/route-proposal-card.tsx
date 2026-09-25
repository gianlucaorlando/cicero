'use client';

import { Check, ChevronRight, Footprints, LocateFixed, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { distanceMeters, humanDistance } from '@/lib/geo';
import { durationLabel } from '@/lib/route';
import type { PlaceCandidate, RouteProposal } from '@/lib/types';

type Props = {
  route: RouteProposal;
  /** Number the first proposed stop takes in the route: the walk continues the numbering. */
  firstNumber: number;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onOpenPlace: (place: PlaceCandidate) => void;
};

/** A walk through the sights around the one just chosen, approved or refused as a whole. */
export function RouteProposalCard({ route, firstNumber, disabled, onAccept, onDecline, onOpenPlace }: Props) {
  const { anchor, stops } = route;

  return (
    <article className="proposal-card route-proposal-card" aria-label={`Percorso proposto da ${anchor.name}`}>
      <div className="proposal-head">
        <span>Ti propongo un giro</span>
        <Badge variant="outline"><Footprints /> a piedi</Badge>
      </div>
      <p className="route-proposal-summary">
        <strong>{stops.length} monumenti vicino a {anchor.name}</strong>
        <small>{humanDistance(route.distanceMeters)} in tutto · {durationLabel(stops.length, route.distanceMeters)}</small>
      </p>

      <ol className="route-proposal-list">
        {stops.map((stop, index) => {
          const previous = index === 0 ? anchor : stops[index - 1];
          const previousName = index === 0 ? anchor.name : stops[index - 1].name;
          return (
            <li key={stop.id}>
              <span className="route-proposal-number">{firstNumber + index}</span>
              <button type="button" onClick={() => onOpenPlace(stop)} aria-label={`Vedi la scheda di ${stop.name}`}>
                <span>
                  <strong>{stop.name}</strong>
                  <small>{humanDistance(distanceMeters(previous, stop))} da {previousName}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="proposal-actions">
        <Button type="button" size="sm" onClick={onAccept} disabled={disabled}>
          {disabled ? <LocateFixed className="spin" /> : <Check />} Sì, approvo
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDecline} disabled={disabled}>
          <X /> No, grazie
        </Button>
      </div>
    </article>
  );
}
