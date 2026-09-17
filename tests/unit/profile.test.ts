import { describe, expect, it } from 'vitest';

import { applyProfilePatch } from '@/hooks/use-profile-sync';
import { createEmptyProfile, normalizeProfile } from '@/lib/profile';

describe('normalizeProfile', () => {
  it('coerces flags to booleans and drops unknown shapes', () => {
    const profile = normalizeProfile({ slowPace: 'yes', noFish: true, learned: { cafe: ['espresso', 42, ' espresso '] } });
    expect(profile.slowPace).toBe(false);
    expect(profile.noFish).toBe(true);
    expect(profile.learned.cafe).toEqual(['espresso']);
    expect(profile.learned.museum).toEqual([]);
  });

  it('caps learned values to four entries of sixty characters', () => {
    const profile = normalizeProfile({ learned: { restaurant: ['a', 'b', 'c', 'd', 'e', 'x'.repeat(80)] } });
    expect(profile.learned.restaurant).toEqual(['a', 'b', 'c', 'd']);
    const long = normalizeProfile({ learned: { restaurant: ['x'.repeat(80)] } });
    expect(long.learned.restaurant[0]).toHaveLength(60);
  });
});

describe('applyProfilePatch', () => {
  it('learns at the front, deduplicates case-insensitively and forgets', () => {
    const base = { ...createEmptyProfile(), learned: { ...createEmptyProfile().learned, cafe: ['Espresso al banco'] } };
    const learned = applyProfilePatch(base, { learn: [{ category: 'cafe', value: 'espresso al banco' }, { category: 'cafe', value: 'posto tranquillo' }] });
    expect(learned.learned.cafe).toEqual(['posto tranquillo', 'espresso al banco']);
    const forgotten = applyProfilePatch(learned, { forget: [{ category: 'cafe', value: 'POSTO TRANQUILLO' }] });
    expect(forgotten.learned.cafe).toEqual(['espresso al banco']);
  });

  it('sets flags without touching the others', () => {
    const next = applyProfilePatch(createEmptyProfile(), { noFish: true });
    expect(next.noFish).toBe(true);
    expect(next.slowPace).toBe(false);
  });
});
