import { describe, expect, it } from 'vitest';

import { candidateLetter, formatRating, humanReviewCount, pluralStops, priceLabel, shiftTime } from '@/lib/format';

describe('shiftTime', () => {
  it('adds minutes and wraps past midnight', () => {
    expect(shiftTime('10:00', 45)).toBe('10:45');
    expect(shiftTime('23:30', 60)).toBe('00:30');
  });

  it('subtracts minutes and wraps before midnight', () => {
    expect(shiftTime('01:00', -90)).toBe('23:30');
  });

  it('leaves malformed labels untouched', () => {
    expect(shiftTime('boh', 10)).toBe('boh');
  });
});

describe('labels', () => {
  it('maps Google price levels to euro signs', () => {
    expect(priceLabel('PRICE_LEVEL_FREE')).toBe('gratis');
    expect(priceLabel('PRICE_LEVEL_MODERATE')).toBe('€€');
    expect(priceLabel('PRICE_LEVEL_UNSPECIFIED')).toBeNull();
    expect(priceLabel(null)).toBeNull();
  });

  it('pluralises stops in Italian', () => {
    expect(pluralStops(1)).toBe('1 tappa');
    expect(pluralStops(3)).toBe('3 tappe');
  });

  it('letters candidates from A', () => {
    expect(candidateLetter(0)).toBe('A');
    expect(candidateLetter(5)).toBe('F');
  });

  it('formats ratings and review counts for Italian readers', () => {
    expect(formatRating(4.25)).toBe('4,3');
    // Sotto i diecimila il numero è per esteso; in italiano quattro cifre non prendono il separatore.
    expect(humanReviewCount(1234)).toBe('1234');
    expect(humanReviewCount(9999)).toBe('9999');
    // Da diecimila in su la notazione diventa compatta.
    expect(humanReviewCount(12_345)).toMatch(/^12\s?K$/);
    expect(humanReviewCount(208_000)).toMatch(/^208\s?K$/);
  });
});
