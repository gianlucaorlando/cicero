import { describe, expect, it } from 'vitest';

import { applyActions, emptyPlan, restoreStop } from '@/lib/conversation-state';
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

  it('a search is remembered without being shown', () => {
    const next = applyActions(emptyPlan, [{ type: 'set_candidates', candidates: [candidate('a'), candidate('b')] }]);
    expect(next.candidates.map((c) => c.id)).toEqual(['a', 'b']);
    expect(next.listed).toBe(false);
    expect(next.proposal).toBeNull();
  });

  it('only show_candidates puts the list on screen', () => {
    const known = applyActions(emptyPlan, [{ type: 'set_candidates', candidates: [candidate('a')] }]);
    expect(known.listed).toBe(false);
    const shown = applyActions(known, [{ type: 'show_candidates', candidates: [candidate('a')] }]);
    expect(shown.listed).toBe(true);
    // Proposing again hides the list and leaves one place on the table.
    const proposed = applyActions(shown, [{ type: 'propose', proposal: { candidate: candidate('a'), reason: '', alternatives: [] } }]);
    expect(proposed.listed).toBe(false);
  });

  it('a new search replaces stale results and drops the standing proposal', () => {
    const proposed = applyActions(emptyPlan, [
      { type: 'propose', proposal: { candidate: candidate('old'), reason: '', alternatives: [candidate('old2')] } },
    ]);
    const searched = applyActions(proposed, [{ type: 'set_candidates', candidates: [candidate('new')] }]);
    expect(searched.candidates.map((c) => c.id)).toEqual(['new']);
    expect(searched.proposal).toBeNull();
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

describe('restoreStop', () => {
  const ids = (stops: Stop[]) => stops.map((s) => s.id);

  it('puts the stop back exactly where it was', () => {
    expect(ids(restoreStop([stop('a'), stop('c')], { stop: stop('b'), index: 1 }))).toEqual(['a', 'b', 'c']);
    expect(ids(restoreStop([stop('b'), stop('c')], { stop: stop('a'), index: 0 }))).toEqual(['a', 'b', 'c']);
  });

  it('restores the last stop of an emptied route', () => {
    expect(ids(restoreStop([], { stop: stop('a'), index: 0 }))).toEqual(['a']);
  });

  it('clamps an index the route has since outgrown or lost', () => {
    expect(ids(restoreStop([stop('a')], { stop: stop('z'), index: 5 }))).toEqual(['a', 'z']);
    expect(ids(restoreStop([stop('a')], { stop: stop('z'), index: -2 }))).toEqual(['z', 'a']);
  });

  it('never duplicates a place that is already back in the route', () => {
    const route = [stop('a'), stop('b')];
    expect(restoreStop(route, { stop: stop('b'), index: 0 })).toBe(route);
    const sameplace = { ...stop('other-id'), placeId: 'a' };
    expect(restoreStop(route, { stop: sameplace, index: 0 })).toBe(route);
  });
});

describe('walk proposals', () => {
  const walk = { anchor: { id: 'a', name: 'Pantheon', lat: 41.9, lng: 12.48 }, stops: [candidate('b'), candidate('c')], distanceMeters: 500 };

  it('a walk proposed right after adding its monument stays pending', () => {
    const next = applyActions(emptyPlan, [{ type: 'add_stops', stops: [stop('a')] }, { type: 'propose_route', route: walk }]);
    expect(next.itinerary.map((s) => s.id)).toEqual(['a']);
    expect(next.routeProposal).toEqual(walk);
    expect(next.proposal).toBeNull();
  });

  it('adding stops consumes the walk, and a single proposal or a dismissal replaces it', () => {
    const pending = { ...emptyPlan, routeProposal: walk };
    expect(applyActions(pending, [{ type: 'add_stops', stops: [stop('b'), stop('c')] }]).routeProposal).toBeNull();
    const proposed = applyActions(pending, [{ type: 'propose', proposal: { candidate: candidate('x'), reason: '', alternatives: [] } }]);
    expect(proposed.routeProposal).toBeNull();
    expect(proposed.proposal?.candidate.id).toBe('x');
    expect(applyActions(pending, [{ type: 'dismiss_proposal' }]).routeProposal).toBeNull();
  });

  it('a walk replaces a single proposal', () => {
    const proposing = applyActions(emptyPlan, [{ type: 'propose', proposal: { candidate: candidate('x'), reason: '', alternatives: [] } }]);
    const next = applyActions(proposing, [{ type: 'propose_route', route: walk }]);
    expect(next.proposal).toBeNull();
    expect(next.candidates).toEqual([]);
    expect(next.routeProposal).toEqual(walk);
  });
});
