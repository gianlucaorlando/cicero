import { describe, expect, it } from 'vitest';

import { normalizeStop, normalizeStops } from '@/lib/server/stops';

describe('normalizeStop', () => {
  it('keeps a well-formed stop and recognises the coffee kind', () => {
    const stop = normalizeStop({ id: 's1', title: 'Bar', kind: 'coffee', lat: 45.46, lng: 9.19, googleMapsUri: 'https://maps.google.com/?cid=1', source: 'google_places' }, 0);
    expect(stop).toMatchObject({ id: 's1', kind: 'coffee', googleMapsUri: 'https://maps.google.com/?cid=1', source: 'google_places' });
  });

  it('rejects stops without a title or with invalid coordinates', () => {
    expect(normalizeStop({ title: '', lat: 45, lng: 9 }, 0)).toBeNull();
    expect(normalizeStop({ title: 'X', lat: 95, lng: 9 }, 0)).toBeNull();
    expect(normalizeStop({ title: 'X', lat: '45', lng: 9 }, 0)).toBeNull();
    expect(normalizeStop(null, 0)).toBeNull();
  });

  it('drops links that do not point to Google Maps over https', () => {
    expect(normalizeStop({ title: 'X', lat: 45, lng: 9, googleMapsUri: 'http://maps.google.com/x' }, 0)?.googleMapsUri).toBeNull();
    expect(normalizeStop({ title: 'X', lat: 45, lng: 9, googleMapsUri: 'https://evil.example/maps.google.com' }, 0)?.googleMapsUri).toBeNull();
  });

  it('falls back to a positional id and to the place kind', () => {
    const stop = normalizeStop({ title: 'X', lat: 45, lng: 9, kind: 'weird' }, 2);
    expect(stop?.id).toBe('stop-3');
    expect(stop?.kind).toBe('place');
  });
});

describe('normalizeStops', () => {
  it('caps the list and skips invalid entries', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, title: `T${i}`, lat: 45, lng: 9 }));
    expect(normalizeStops(many)).toHaveLength(20);
    expect(normalizeStops([{ title: 'ok', lat: 45, lng: 9 }, { title: 'bad', lat: 999, lng: 9 }])).toHaveLength(1);
    expect(normalizeStops('nope')).toEqual([]);
  });
});
