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
    findTransitHubs: vi.fn(),
    findSightsNearby: vi.fn(),
  };
});

import { createEmptyProfile } from '@/lib/profile';
import { contextPrompt } from '@/lib/server/agent/prompt';
import { AgentSession } from '@/lib/server/agent/tools';
import { clearDiscoveryCache } from '@/lib/server/discover';
import { findSightsNearby, getPlaceDetails, PlacesError, searchPlaces } from '@/lib/server/places';
import type { ChatContext, PlaceCandidate, PlaceDetails, RouteProposal } from '@/lib/types';

const origin = { lat: 41.8959, lng: 12.4823 };

const place = (id: string, lat: number, lng: number, primaryType: string, userRatingCount: number): PlaceCandidate => ({
  id, name: id.replace(/^ChIJ/, ''), address: 'Roma', lat, lng, primaryType, businessStatus: 'OPERATIONAL',
  googleMapsUri: null, rating: 4.7, userRatingCount, distanceMeters: 300,
});

const PANTHEON = place('ChIJPantheon', 41.8986, 12.4769, 'historical_landmark', 287_000);
const NAVONA = place('ChIJNavona00', 41.8992, 12.4731, 'plaza', 150_000);
const MINERVA = place('ChIJMinerva0', 41.8980, 12.4779, 'church', 9_000);
const TREVI = place('ChIJTrevi000', 41.9009, 12.4833, 'fountain', 400_000);
const ROSETTA = place('ChIJRosetta0', 41.8990, 12.4760, 'italian_restaurant', 5_000);
const EVERYTHING = [PANTHEON, NAVONA, MINERVA, TREVI, ROSETTA];

const details = (candidate: PlaceCandidate): PlaceDetails => ({
  id: candidate.id, name: candidate.name, address: candidate.address, lat: candidate.lat, lng: candidate.lng,
  primaryType: candidate.primaryType, businessStatus: 'OPERATIONAL', openNow: true, nextOpenTime: null, nextCloseTime: null,
  weekdayDescriptions: [], priceLevel: null, rating: candidate.rating, userRatingCount: candidate.userRatingCount,
  googleMapsUri: null, websiteUri: null,
});

const context = (overrides: Partial<ChatContext> = {}): ChatContext => ({
  city: 'Roma', locationLabel: 'Piazza Venezia', origin, weather: 'sereno', localTime: '10:00',
  itinerary: [], candidates: [], proposing: false, profile: createEmptyProfile(), ...overrides,
});

const walkOf = (session: AgentSession) => {
  const action = session.actions.find((item) => item.type === 'propose_route');
  return action?.type === 'propose_route' ? action.route : null;
};

beforeEach(() => {
  clearDiscoveryCache();
  vi.mocked(searchPlaces).mockReset();
  vi.mocked(findSightsNearby).mockReset();
  vi.mocked(findSightsNearby).mockResolvedValue([NAVONA, MINERVA, TREVI, ROSETTA]);
  vi.mocked(getPlaceDetails).mockReset();
  vi.mocked(getPlaceDetails).mockImplementation(async (id: string) => {
    const found = EVERYTHING.find((candidate) => candidate.id === id);
    if (!found) throw new PlacesError('PLACES_UPSTREAM_ERROR', 'not found', 404);
    return details(found);
  });
});

describe('a monument chosen with others nearby', () => {
  it('adds the monument and proposes a walk through the sights around it, searching around the monument', async () => {
    const session = new AgentSession(context({ candidates: [PANTHEON], proposing: true }));
    const result = await session.execute('add_stops', { places: [PANTHEON.id] });

    expect(result.isError).toBe(false);
    expect(session.actions.map((action) => action.type)).toEqual(['add_stops', 'propose_route']);
    const walk = walkOf(session)!;
    expect(walk.anchor).toMatchObject({ id: PANTHEON.id, name: PANTHEON.name });
    expect(walk.stops.map((stop) => stop.id).sort()).toEqual([MINERVA.id, NAVONA.id, TREVI.id].sort());
    expect(walk.stops.map((stop) => stop.id)).not.toContain(ROSETTA.id);
    expect(walk.distanceMeters).toBeGreaterThan(0);
    // The search is centred on the monument, not on the user.
    expect(vi.mocked(findSightsNearby).mock.calls[0][0]).toEqual({ lat: PANTHEON.lat, lng: PANTHEON.lng });
    expect(searchPlaces).not.toHaveBeenCalled();
    // The model is told what was proposed and to wait for the answer.
    expect(result.content).toMatch(/Percorso proposto/);
    expect(result.content).toMatch(/Non proporre altro/);
  });

  it('blocks any other proposal in the same turn', async () => {
    const session = new AgentSession(context({ discovery: [{ ...ROSETTA, category: 'food' }] }));
    await session.execute('add_stops', { places: [PANTHEON.id] });
    const second = await session.execute('propose_stop', { place: ROSETTA.id, reason: 'pranzo' });
    expect(second.isError).toBe(true);
    expect(session.actions.map((action) => action.type)).toEqual(['add_stops', 'propose_route']);
  });

  it('reuses the search for the same monument instead of paying again', async () => {
    await new AgentSession(context()).execute('add_stops', { places: [PANTHEON.id] });
    await new AgentSession(context()).execute('add_stops', { places: [PANTHEON.id] });
    expect(findSightsNearby).toHaveBeenCalledTimes(1);
  });

  it('builds the walk from the map when the search fails', async () => {
    vi.mocked(findSightsNearby).mockRejectedValueOnce(new PlacesError('PLACES_UPSTREAM_ERROR', 'down', 502));
    const discovery = [NAVONA, MINERVA].map((sight) => ({ ...sight, category: 'sight' as const }));
    const session = new AgentSession(context({ discovery }));
    await session.execute('add_stops', { places: [PANTHEON.id] });
    expect(walkOf(session)!.stops.map((stop) => stop.id).sort()).toEqual([MINERVA.id, NAVONA.id].sort());
  });
});

describe('when no walk is proposed', () => {
  it('a place to eat is just added', async () => {
    const session = new AgentSession(context());
    await session.execute('add_stops', { places: [ROSETTA.id] });
    expect(walkOf(session)).toBeNull();
    expect(findSightsNearby).not.toHaveBeenCalled();
  });

  it('several places added together are the user\'s own plan', async () => {
    const session = new AgentSession(context());
    await session.execute('add_stops', { places: [PANTHEON.id, TREVI.id] });
    expect(walkOf(session)).toBeNull();
  });

  it('fewer than two sights close by make no walk', async () => {
    vi.mocked(findSightsNearby).mockResolvedValue([NAVONA, ROSETTA]);
    const session = new AgentSession(context());
    const result = await session.execute('add_stops', { places: [PANTHEON.id] });
    expect(walkOf(session)).toBeNull();
    expect(result.content).not.toMatch(/Percorso proposto/);
  });
});

describe('answering a walk', () => {
  const pending: RouteProposal = {
    anchor: { id: PANTHEON.id, name: PANTHEON.name, lat: PANTHEON.lat, lng: PANTHEON.lng },
    stops: [MINERVA, NAVONA],
    distanceMeters: 450,
  };
  const withPantheon = () => context({
    routeProposal: pending,
    itinerary: [{ id: PANTHEON.id, placeId: PANTHEON.id, time: '10:15', title: PANTHEON.name, detail: '', kind: 'place', lat: PANTHEON.lat, lng: PANTHEON.lng, primaryType: PANTHEON.primaryType }],
  });

  it('approving adds every stop in order and does not chain another walk', async () => {
    const session = new AgentSession(withPantheon());
    await session.execute('add_stops', { places: [MINERVA.id, NAVONA.id] });
    const added = session.actions.find((action) => action.type === 'add_stops');
    expect(added?.type === 'add_stops' && added.stops.map((stop) => stop.id)).toEqual([MINERVA.id, NAVONA.id]);
    expect(walkOf(session)).toBeNull();
  });

  it('taking only the first stop of the walk does not start a new walk from it', async () => {
    const session = new AgentSession(withPantheon());
    await session.execute('add_stops', { places: [MINERVA.id] });
    expect(walkOf(session)).toBeNull();
    expect(findSightsNearby).not.toHaveBeenCalled();
  });

  it('a stop of the walk can be proposed on its own after all', async () => {
    const session = new AgentSession(withPantheon());
    const result = await session.execute('propose_stop', { place: NAVONA.id, reason: 'solo la piazza' });
    expect(result.isError).toBeUndefined();
    expect(session.actions.at(-1)?.type).toBe('propose');
  });

  it('the pending walk is in the context the model reads', () => {
    const text = contextPrompt(withPantheon());
    expect(text).toMatch(/Percorso proposto in attesa di approvazione, da Pantheon/);
    expect(text).toContain(`[place_id ${MINERVA.id}]`);
    expect(contextPrompt(context())).toMatch(/Nessun percorso proposto in attesa/);
  });
});

describe('walks and a plan built by the user', () => {
  it('a second addition in the same turn withdraws the walk and lets Cicerone propose again', async () => {
    const session = new AgentSession(context({ discovery: [{ ...ROSETTA, category: 'food' }] }));
    await session.execute('add_stops', { places: [PANTHEON.id] });
    expect(walkOf(session)).not.toBeNull();
    await session.execute('add_stops', { places: [TREVI.id] });
    expect(walkOf(session)).toBeNull();
    // No new walk from the second monument: the user is building the plan themselves.
    expect(findSightsNearby).toHaveBeenCalledTimes(1);
    const lunch = await session.execute('propose_stop', { place: ROSETTA.id, reason: 'pranzo vicino' });
    expect(lunch.isError).toBeUndefined();
    expect(session.actions.map((action) => action.type)).toEqual(['add_stops', 'add_stops', 'propose']);
  });

  it('offer_walk false adds the monument without proposing a walk', async () => {
    const session = new AgentSession(context());
    const result = await session.execute('add_stops', { places: [PANTHEON.id], offer_walk: false });
    expect(result.isError).toBe(false);
    expect(walkOf(session)).toBeNull();
    expect(findSightsNearby).not.toHaveBeenCalled();
  });
});

describe('removing the monument a walk starts from', () => {
  it('drops the walk from the context of the rest of the turn', async () => {
    const pending: RouteProposal = {
      anchor: { id: PANTHEON.id, name: PANTHEON.name, lat: PANTHEON.lat, lng: PANTHEON.lng },
      stops: [MINERVA, NAVONA],
      distanceMeters: 450,
    };
    const session = new AgentSession(context({
      routeProposal: pending,
      discovery: [{ ...ROSETTA, category: 'food' }],
      itinerary: [{ id: PANTHEON.id, placeId: PANTHEON.id, time: '10:15', title: PANTHEON.name, detail: '', kind: 'place', lat: PANTHEON.lat, lng: PANTHEON.lng, primaryType: PANTHEON.primaryType }],
    }));
    await session.execute('remove_stops', { stop_ids: [PANTHEON.id] });
    // With the walk gone, a stop of it is no longer proposable as part of the walk, but any place on the map is.
    const next = await session.execute('propose_stop', { place: ROSETTA.id, reason: 'shopping poi pranzo' });
    expect(next.isError).toBeUndefined();
    expect(session.actions.map((action) => action.type)).toEqual(['remove_stops', 'propose']);
  });
});
