import { shiftTime } from '@/lib/format';
import type { ChatAction, PlaceCandidate, Stop } from '@/lib/types';

export type PlanState = { itinerary: Stop[]; candidates: PlaceCandidate[] };

/**
 * Applies agent actions in order. A search shows candidates; adding stops
 * consumes them, so a later add clears what an earlier search displayed.
 */
export function applyActions(state: PlanState, actions: ChatAction[]): PlanState {
  return actions.reduce<PlanState>((current, action) => {
    switch (action.type) {
      case 'show_candidates':
        return { ...current, candidates: action.candidates };
      case 'add_stops': {
        const known = new Set(current.itinerary.map((stop) => stop.placeId || stop.id));
        return {
          itinerary: [...current.itinerary, ...action.stops.filter((stop) => !known.has(stop.placeId || stop.id))],
          candidates: [],
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
