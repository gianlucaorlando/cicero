import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/places', () => {
  class PlacesError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    PlacesError,
    isValidPlaceId: (id: string) => /^[A-Za-z0-9_-]{8,300}$/.test(id),
    searchPlaces: vi.fn(),
    getPlaceDetails: vi.fn(),
  };
});

import { createEmptyProfile } from '@/lib/profile';
import { AgentSession } from '@/lib/server/agent/tools';
import { getPlaceDetails, PlacesError, searchPlaces } from '@/lib/server/places';
import type { ChatContext, PlaceCandidate, PlaceDetails } from '@/lib/types';

const origin = { lat: 45.4642, lng: 9.19 };

const candidate = (id: string, lat = 45.465, lng = 9.191): PlaceCandidate => ({
  id, name: `Posto ${id}`, address: 'Via X 1', lat, lng, primaryType: 'cafe', businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.5, userRatingCount: 120, distanceMeters: 150, tripadvisor: null,
});

const details = (id: string, lat = 45.465, lng = 9.191): PlaceDetails => ({
  id, name: `Posto ${id}`, address: 'Via X 1', lat, lng, primaryType: 'cafe', businessStatus: 'OPERATIONAL',
  openNow: true, nextOpenTime: null, nextCloseTime: '19:00', weekdayDescriptions: [], priceLevel: 'PRICE_LEVEL_MODERATE',
  rating: 4.5, userRatingCount: 120, googleMapsUri: 'https://maps.google.com/?cid=1', websiteUri: null,
});

const context = (overrides: Partial<ChatContext> = {}): ChatContext => ({
  city: 'Milano', locationLabel: 'Centro', origin, weather: 'sereno', localTime: '10:00',
  itinerary: [], candidates: [], proposing: false, profile: createEmptyProfile(), ...overrides,
});

const CANDIDATES = ['place-aaaa', 'place-bbbb', 'place-cccc'].map((id, i) => candidate(id, 45.465 + i * 0.002, 9.191));

beforeEach(() => {
  vi.mocked(searchPlaces).mockResolvedValue(CANDIDATES);
  vi.mocked(getPlaceDetails).mockImplementation(async (id: string) => {
    const found = CANDIDATES.find((c) => c.id === id);
    if (!found) throw new PlacesError('PLACES_UPSTREAM_ERROR', 'not found', 404);
    return details(id, found.lat, found.lng);
  });
});

describe('search → propose → accept', () => {
  it('a search shows nothing by itself; the proposal shows one place and keeps the rest as alternatives', async () => {
    const session = new AgentSession(context());
    const search = await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    expect(search.isError).toBeUndefined();
    // The client is told what was found, but nothing is put on screen yet.
    expect(session.actions.map((a) => a.type)).toEqual(['set_candidates']);
    const found = session.actions[0];
    expect(found.type === 'set_candidates' && found.candidates.map((c) => c.id)).toEqual(['place-aaaa', 'place-bbbb', 'place-cccc']);

    const proposed = await session.execute('propose_stop', { place: 'A', reason: 'È a due passi.' });
    expect(proposed.isError).toBeUndefined();
    const action = session.actions.find((a) => a.type === 'propose');
    expect(action?.type === 'propose' && action.proposal.candidate.id).toBe('place-aaaa');
    expect(action?.type === 'propose' && action.proposal.alternatives.map((c) => c.id)).toEqual(['place-bbbb', 'place-cccc']);
  });

  it('accepting adds the proposed place, drops the proposal action and schedules the stop from the local time', async () => {
    const session = new AgentSession(context());
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('propose_stop', { place: 'A', reason: 'vicino' });
    const added = await session.execute('add_stops', { places: ['A.'] });
    expect(added.isError).toBeFalsy();
    expect(getPlaceDetails).toHaveBeenCalledWith('place-aaaa');
    expect(session.actions.some((a) => a.type === 'propose')).toBe(false);
    const add = session.actions.find((a) => a.type === 'add_stops');
    expect(add?.type === 'add_stops' && add.stops[0]).toMatchObject({ placeId: 'place-aaaa', time: '10:15', kind: 'coffee' });
    expect(add?.type === 'add_stops' && add.stops[0].detail).toContain('aperto ora');
  });

  it('understands "opzione B" and refuses letters that do not exist', async () => {
    const session = new AgentSession(context());
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    const added = await session.execute('add_stops', { places: ['opzione B'] });
    expect(added.isError).toBeFalsy();
    expect(getPlaceDetails).toHaveBeenCalledWith('place-bbbb');
    const missing = await session.execute('add_stops', { places: ['Z'] });
    expect(missing.isError).toBe(true);
  });

  it('cannot propose a place that was not found by the last search', async () => {
    const session = new AgentSession(context());
    const result = await session.execute('propose_stop', { place: 'place-zzzz', reason: 'x' });
    expect(result.isError).toBe(true);
  });

  it('a new search replaces an earlier proposal in the same turn and filters places already in the plan', async () => {
    const session = new AgentSession(context({ itinerary: [{ id: 'place-aaaa', placeId: 'place-aaaa', time: '09:00', title: 'A', detail: '', kind: 'place', lat: 45.465, lng: 9.191 }] }));
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('propose_stop', { place: 'A', reason: 'x' });
    const first = session.actions.find((a) => a.type === 'propose');
    expect(first?.type === 'propose' && first.proposal.candidate.id).toBe('place-bbbb');
    await session.execute('search_places', { query: 'gelato', near: 'origin', open_now: true });
    expect(session.actions.some((a) => a.type === 'propose')).toBe(false);
  });
});

describe('per-request spend ceilings', () => {
  it('stops after three searches in one request', async () => {
    const session = new AgentSession(context());
    for (let i = 0; i < 3; i += 1) {
      const ok = await session.execute('search_places', { query: `q${i}`, near: 'origin', open_now: true });
      expect(ok.isError).toBeFalsy();
    }
    const blocked = await session.execute('search_places', { query: 'q4', near: 'origin', open_now: true });
    expect(blocked.isError).toBe(true);
    expect(blocked.content).toMatch(/3 ricerche/);
    expect(searchPlaces).toHaveBeenCalledTimes(3);
  });

  it('stops after eight place verifications, counting add_stops and get_place_details together', async () => {
    const session = new AgentSession(context());
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    for (let i = 0; i < 8; i += 1) {
      await session.execute('get_place_details', { place: 'place-aaaa' });
    }
    expect(getPlaceDetails).toHaveBeenCalledTimes(8);
    const blockedDetails = await session.execute('get_place_details', { place: 'place-bbbb' });
    expect(blockedDetails.isError).toBe(true);
    const blockedAdd = await session.execute('add_stops', { places: ['B'] });
    expect(blockedAdd.isError).toBe(true);
    // No extra paid lookups once the ceiling is reached.
    expect(getPlaceDetails).toHaveBeenCalledTimes(8);
  });

  it('free tools keep working after the paid ceiling is reached', async () => {
    const session = new AgentSession(context());
    for (let i = 0; i < 4; i += 1) await session.execute('search_places', { query: `q${i}`, near: 'origin', open_now: true });
    const replies = await session.execute('suggest_replies', { replies: ['Sì', 'No'] });
    expect(replies.isError).toBeFalsy();
  });
});

describe('scheduling a new stop', () => {
  it('puts the first stop shortly after the local time', async () => {
    const session = new AgentSession(context({ localTime: '10:00' }));
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('add_stops', { places: ['A'] });
    const add = session.actions.find((a) => a.type === 'add_stops');
    expect(add?.type === 'add_stops' && add.stops[0].time).toBe('10:15');
  });

  it('puts a later stop after the last one, not at local time plus a count', async () => {
    // A plan whose times were shifted forward: scheduling from localTime would land before them.
    const session = new AgentSession(context({
      localTime: '10:00',
      itinerary: [{ id: 's1', placeId: 'place-zzzz', time: '18:00', title: 'Cena', detail: '', kind: 'place', lat: 45.465, lng: 9.191 }],
    }));
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('add_stops', { places: ['A'] });
    const add = session.actions.find((a) => a.type === 'add_stops');
    expect(add?.type === 'add_stops' && add.stops[0].time).toBe('18:45');
  });

  it('keeps times ascending after a removal', async () => {
    const session = new AgentSession(context({
      localTime: '12:00',
      itinerary: [
        { id: 's1', placeId: 'place-yyyy', time: '12:15', title: 'A', detail: '', kind: 'place', lat: 45.465, lng: 9.191 },
        { id: 's2', placeId: 'place-zzzz', time: '13:00', title: 'B', detail: '', kind: 'place', lat: 45.466, lng: 9.191 },
      ],
    }));
    await session.execute('remove_stops', { stop_ids: ['s1'] });
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('add_stops', { places: ['A'] });
    const add = session.actions.find((a) => a.type === 'add_stops');
    // B is still at 13:00, so the new stop must come after it rather than collide.
    expect(add?.type === 'add_stops' && add.stops[0].time).toBe('13:45');
  });
});

describe('closing tools', () => {
  it('suggest_replies keeps only the last set and needs at least two replies', async () => {
    const session = new AgentSession(context());
    expect((await session.execute('suggest_replies', { replies: ['solo una'] })).isError).toBe(true);
    await session.execute('suggest_replies', { replies: ['Sì', 'No'] });
    await session.execute('suggest_replies', { replies: ['Sì, aggiungila', 'Un’altra', 'Basta così'] });
    const replies = session.actions.filter((a) => a.type === 'suggest_replies');
    expect(replies).toHaveLength(1);
    expect(replies[0].type === 'suggest_replies' && replies[0].replies).toHaveLength(3);
  });

  it('dismiss_proposal withdraws the proposal and forgets the candidates', async () => {
    const session = new AgentSession(context());
    await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    await session.execute('propose_stop', { place: 'A', reason: 'x' });
    await session.execute('dismiss_proposal', {});
    expect(session.actions.map((a) => a.type)).toEqual(['dismiss_proposal']);
    expect((await session.execute('show_options', {})).isError).toBe(true);
  });
});

describe('editing the itinerary', () => {
  const plan = context({
    localTime: '12:00',
    itinerary: [
      { id: 's1', placeId: 'place-aaaa', time: '12:15', title: 'Primo', detail: '150 m · aperto ora', kind: 'place', lat: 45.465, lng: 9.191 },
      { id: 's2', placeId: 'place-bbbb', time: '13:00', title: 'Secondo', detail: '250 m · aperto ora', kind: 'place', lat: 45.467, lng: 9.191 },
    ],
  });

  it('reorders in place, reassigning times and recomputing the leg distance', async () => {
    const session = new AgentSession(plan);
    const result = await session.execute('reorder_stops', { stop_ids: ['s2', 's1'] });
    expect(result.isError).toBeUndefined();
    const action = session.actions.find((a) => a.type === 'set_itinerary');
    const stops = action?.type === 'set_itinerary' ? action.stops : [];
    expect(stops.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(stops.map((s) => s.time)).toEqual(['12:15', '13:00']);
    expect(stops[0].detail).toMatch(/^\d+ m · aperto ora$/);
    expect(stops[0].detail).not.toBe('250 m · aperto ora');
  });

  it('refuses to reorder with fewer than two known ids', async () => {
    const session = new AgentSession(plan);
    expect((await session.execute('reorder_stops', { stop_ids: ['s1', 'nope'] })).isError).toBe(true);
  });

  it('removes only known stops and shifts every time', async () => {
    const session = new AgentSession(plan);
    expect((await session.execute('remove_stops', { stop_ids: ['ghost'] })).isError).toBe(true);
    await session.execute('remove_stops', { stop_ids: ['s1'] });
    expect(session.actions.at(-1)).toEqual({ type: 'remove_stops', stopIds: ['s1'] });
    await session.execute('shift_times', { minutes: 30 });
    expect(session.actions.at(-1)).toEqual({ type: 'shift_times', minutes: 30 });
    expect((await session.execute('shift_times', { minutes: 0 })).isError).toBe(true);
  });
});

describe('profile and failures', () => {
  it('validates preference patches and drops unknown categories', async () => {
    const session = new AgentSession(context());
    expect((await session.execute('update_profile', { learn: [{ category: 'astrology', value: 'x' }] })).isError).toBe(true);
    await session.execute('update_profile', { no_fish: true, learn: [{ category: 'cafe', value: '  espresso al banco  ' }, { category: 'nope', value: 'x' }] });
    expect(session.actions.at(-1)).toEqual({ type: 'update_profile', patch: { noFish: true, learn: [{ category: 'cafe', value: 'espresso al banco' }] } });
  });

  it('reports an unconfigured Places key as a tool error instead of throwing', async () => {
    vi.mocked(searchPlaces).mockRejectedValueOnce(new PlacesError('PLACES_NOT_CONFIGURED', 'no key', 503));
    const session = new AgentSession(context());
    const result = await session.execute('search_places', { query: 'caffè', near: 'origin', open_now: true });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/non è configurato/);
  });

  it('rejects unknown tools', async () => {
    const session = new AgentSession(context());
    expect((await session.execute('teleport', {})).isError).toBe(true);
  });
});
