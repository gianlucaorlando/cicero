import { shiftTime } from '@/lib/format';
import type { ChatAction, PlaceCandidate, Proposal, Stop } from '@/lib/types';

export type PlanState = {
  itinerary: Stop[];
  /** Search results: with a proposal, index 0 is the proposed place and the rest are alternatives. */
  candidates: PlaceCandidate[];
  proposal: Proposal | null;
  /** Quick replies suggested by the agent for the next turn. */
  suggestions: string[];
};

export const emptyPlan: PlanState = { itinerary: [], candidates: [], proposal: null, suggestions: [] };

/**
 * Applies agent actions in order. A proposal or a search replaces what was
 * shown before; adding stops consumes it.
 */
export function applyActions(state: PlanState, actions: ChatAction[]): PlanState {
  return actions.reduce<PlanState>((current, action) => {
    switch (action.type) {
      case 'show_candidates':
        return { ...current, candidates: action.candidates, proposal: null };
      case 'propose':
        return { ...current, candidates: [action.proposal.candidate, ...action.proposal.alternatives], proposal: action.proposal };
      case 'dismiss_proposal':
        return { ...current, candidates: [], proposal: null };
      case 'suggest_replies':
        return { ...current, suggestions: action.replies };
      case 'add_stops': {
        const known = new Set(current.itinerary.map((stop) => stop.placeId || stop.id));
        return {
          ...current,
          itinerary: [...current.itinerary, ...action.stops.filter((stop) => !known.has(stop.placeId || stop.id))],
          candidates: [],
          proposal: null,
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
