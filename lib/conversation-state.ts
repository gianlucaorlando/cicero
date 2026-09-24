import { shiftTime } from '@/lib/format';
import type { ChatAction, PlaceCandidate, Proposal, RouteProposal, Stop } from '@/lib/types';

export type PlanState = {
  itinerary: Stop[];
  /**
   * Results of the last search, mirrored from the server so the letters the
   * model sees next turn match these. With a proposal, index 0 is the proposed
   * place and the rest are its alternatives.
   */
  candidates: PlaceCandidate[];
  /** Whether those candidates are on screen as a list. Knowing them is not showing them. */
  listed: boolean;
  proposal: Proposal | null;
  /** A walk through nearby sights waiting for a yes: one proposal for several stops. */
  routeProposal: RouteProposal | null;
  /** Quick replies suggested by the agent for the next turn. */
  suggestions: string[];
};

export const emptyPlan: PlanState = { itinerary: [], candidates: [], listed: false, proposal: null, routeProposal: null, suggestions: [] };

/** A stop the user just took out by hand, and where it was, so a mistaken tap can be undone. */
export type StopRemoval = { stop: Stop; index: number };

/** Puts a removed stop back where it was, unless the same place is already in the route again. */
export function restoreStop(itinerary: Stop[], removal: StopRemoval): Stop[] {
  const { stop, index } = removal;
  if (itinerary.some((item) => item.id === stop.id || (stop.placeId && item.placeId === stop.placeId))) return itinerary;
  const next = [...itinerary];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, stop);
  return next;
}

/**
 * Applies agent actions in order. A proposal or a search replaces what was
 * shown before; adding stops consumes it. Only one question is pending at a
 * time: a walk and a single proposal replace each other.
 */
export function applyActions(state: PlanState, actions: ChatAction[]): PlanState {
  return actions.reduce<PlanState>((current, action) => {
    switch (action.type) {
      case 'set_candidates':
        return { ...current, candidates: action.candidates, listed: false, proposal: null };
      case 'show_candidates':
        return { ...current, candidates: action.candidates, listed: true, proposal: null };
      case 'propose':
        return {
          ...current,
          candidates: [action.proposal.candidate, ...action.proposal.alternatives],
          listed: false,
          proposal: action.proposal,
          routeProposal: null,
        };
      case 'propose_route':
        return { ...current, candidates: [], listed: false, proposal: null, routeProposal: action.route };
      case 'dismiss_proposal':
        return { ...current, candidates: [], listed: false, proposal: null, routeProposal: null };
      case 'suggest_replies':
        return { ...current, suggestions: action.replies };
      case 'add_stops': {
        const known = new Set(current.itinerary.map((stop) => stop.placeId || stop.id));
        return {
          ...current,
          itinerary: [...current.itinerary, ...action.stops.filter((stop) => !known.has(stop.placeId || stop.id))],
          candidates: [],
          listed: false,
          proposal: null,
          routeProposal: null,
        };
      }
      case 'remove_stops':
        return { ...current, itinerary: current.itinerary.filter((stop) => !action.stopIds.includes(stop.id)) };
      case 'shift_times':
        return { ...current, itinerary: current.itinerary.map((stop) => ({ ...stop, time: shiftTime(stop.time, action.minutes) })) };
      case 'set_itinerary':
        return { ...current, itinerary: action.stops };
      default:
        return current;
    }
  }, state);
}
