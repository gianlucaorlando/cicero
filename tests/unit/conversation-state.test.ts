import { describe, expect, it } from 'vitest';

import { applyActions, emptyPlan } from '@/lib/conversation-state';
import type { PlaceCandidate, Stop } from '@/lib/types';

const candidate = (id: string): PlaceCandidate => ({
  id, name: id, address: '', lat: 45.46, lng: 9.19, primaryType: 'cafe', businessStatus: null,
  googleMapsUri: null, rating: null, userRatingCount: null, distanceMeters: 100, tripadvisor: null,
});

const stop = (id: string, time = '10:00'): Stop => ({
  id, placeId: id, time, title: id, detail: '', kind: 'place', lat: 45.46, lng: 9.19,
});

describe('applyActions', () => {
  it('a proposal puts the proposed place first and keeps the alternatives', () => {
    const next = applyActions(emptyPlan, [
      { type: 'propose', proposal: { candidate: candidate('a'), reason: 'vicino', alternatives: [candidate('b'), candidate('c')] } },
    ]);
    expect(next.proposal?.candidate.id).toBe('a');
    expect(next.candidates.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('adding stops consumes the proposal and the candidates', () => {
    const proposed = applyActions(emptyPlan, [
      { type: 'propose', proposal: { candidate: candidate('a'), reason: '', alternatives: [candidate('b')] } },
    ]);
    const next = applyActions(proposed, [{ type: 'add_stops', stops: [stop('a')] }]);
    expect(next.itinerary.map((s) => s.id)).toEqual(['a']);
    expect(next.proposal).toBeNull();
    expect(next.candidates).toEqual([]);
  });

  it('does not add the same place twice', () => {
    const next = applyActions({ ...emptyPlan, itinerary: [stop('a')] }, [{ type: 'add_stops', stops: [stop('a'), stop('b')] }]);
    expect(next.itinerary.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('a list replaces a proposal, and a dismissal clears both', () => {
    const listed = applyActions({ ...emptyPlan, proposal: { candidate: candidate('a'), reason: '', alternatives: [] } }, [
      { type: 'show_candidates', candidates: [candidate('x'), candidate('y')] },
    ]);
    expect(listed.proposal).toBeNull();
    expect(listed.candidates).toHaveLength(2);
    const cleared = applyActions(listed, [{ type: 'dismiss_proposal' }]);
    expect(cleared.candidates).toEqual([]);
  });

  it('removes, shifts and replaces the itinerary', () => {
    const plan = { ...emptyPlan, itinerary: [stop('a', '10:00'), stop('b', '23:30')] };
    expect(applyActions(plan, [{ type: 'remove_stops', stopIds: ['a'] }]).itinerary.map((s) => s.id)).toEqual(['b']);
    expect(applyActions(plan, [{ type: 'shift_times', minutes: 60 }]).itinerary.map((s) => s.time)).toEqual(['11:00', '00:30']);
    expect(applyActions(plan, [{ type: 'set_itinerary', stops: [stop('z')] }]).itinerary.map((s) => s.id)).toEqual(['z']);
  });

  it('records quick replies without touching the plan', () => {
    const next = applyActions({ ...emptyPlan, itinerary: [stop('a')] }, [{ type: 'suggest_replies', replies: ['Sì', 'No'] }]);
    expect(next.suggestions).toEqual(['Sì', 'No']);
    expect(next.itinerary).toHaveLength(1);
  });

  it('applies actions in order: propose then add within the same turn ends without a proposal', () => {
    const next = applyActions(emptyPlan, [
      { type: 'propose', proposal: { candidate: candidate('a'), reason: '', alternatives: [] } },
      { type: 'add_stops', stops: [stop('a')] },
      { type: 'propose', proposal: { candidate: candidate('b'), reason: '', alternatives: [] } },
      { type: 'suggest_replies', replies: ['Sì, aggiungila', 'Un’altra'] },
    ]);
    expect(next.itinerary.map((s) => s.id)).toEqual(['a']);
    expect(next.proposal?.candidate.id).toBe('b');
    expect(next.suggestions).toHaveLength(2);
  });
});
