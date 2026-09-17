import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

vi.mock('@/lib/server/places', () => {
  class PlacesError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    PlacesError,
    isValidPlaceId: () => true,
    searchPlaces: vi.fn(async () => [{
      id: 'place-aaaa', name: 'Bar Uno', address: 'Via X', lat: 45.465, lng: 9.191, primaryType: 'cafe', businessStatus: 'OPERATIONAL',
      googleMapsUri: null, rating: 4.4, userRatingCount: 10, distanceMeters: 120, tripadvisor: null,
    }]),
    getPlaceDetails: vi.fn(),
  };
});

import { createEmptyProfile } from '@/lib/profile';
import { runAgent } from '@/lib/server/agent/run';
import type { ChatRequest } from '@/lib/types';

const request = (): ChatRequest => ({
  messages: [{ role: 'user', text: 'Vorrei un caffè.' }],
  context: {
    city: 'Milano', locationLabel: 'Centro', origin: { lat: 45.4642, lng: 9.19 }, weather: 'sereno', localTime: '10:00',
    itinerary: [], candidates: [], proposing: false, profile: createEmptyProfile(),
  },
});

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const text = (value: string) => ({ type: 'text', text: value });

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  create.mockReset();
});

describe('runAgent', () => {
  it('closes the turn on suggest_replies and keeps the text written alongside the proposal', async () => {
    create
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [toolUse('t1', 'search_places', { query: 'caffè', near: 'origin', open_now: true })] })
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          text('Ti propongo Bar Uno, a due passi. Ti va?'),
          toolUse('t2', 'propose_stop', { place: 'A', reason: 'vicino' }),
          toolUse('t3', 'suggest_replies', { replies: ['Sì, aggiungila', 'Un’altra'] }),
        ],
      });

    const response = await runAgent(request());
    expect(create).toHaveBeenCalledTimes(2);
    expect(response.reply).toBe('Ti propongo Bar Uno, a due passi. Ti va?');
    expect(response.actions.map((a) => a.type)).toEqual(['propose', 'suggest_replies']);
    expect(response.meta).toBe('Proposta verificata su Google Places');
  });

  it('adds default quick replies when the model forgets them', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [text('Dimmi quanto tempo hai.')] });
    const response = await runAgent(request());
    const replies = response.actions.find((a) => a.type === 'suggest_replies');
    expect(replies?.type === 'suggest_replies' && replies.replies.length).toBeGreaterThanOrEqual(2);
    expect(response.reply).toBe('Dimmi quanto tempo hai.');
  });

  it('offers proposal-shaped defaults when a proposal is still pending', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [text('Allora?')] });
    const pending = request();
    pending.context.proposing = true;
    pending.context.candidates = [{
      id: 'place-aaaa', name: 'Bar Uno', address: '', lat: 45.465, lng: 9.191, primaryType: 'cafe', businessStatus: null,
      googleMapsUri: null, rating: null, userRatingCount: null, distanceMeters: 120, tripadvisor: null,
    }];
    const response = await runAgent(pending);
    const replies = response.actions.find((a) => a.type === 'suggest_replies');
    expect(replies?.type === 'suggest_replies' && replies.replies[0]).toBe('Sì, aggiungila');
  });

  it('returns a polite refusal text on a refusal stop', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    const response = await runAgent(request());
    expect(response.reply).toMatch(/Preferisco non rispondere/);
    expect(response.actions).toEqual([]);
  });

  it('never sends a history that starts with the assistant', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [text('Ok.')] });
    const withGreeting = request();
    withGreeting.messages = [{ role: 'assistant', text: 'Ciao, sono Cicero.' }, ...withGreeting.messages];
    await runAgent(withGreeting);
    const sent = create.mock.calls[0][0].messages;
    expect(sent[0].role).toBe('user');
  });
});
