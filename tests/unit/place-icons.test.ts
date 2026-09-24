import { describe, expect, it } from 'vitest';

import { brandOf, normaliseName, placeIcon } from '@/lib/place-icons';
import { placeTypeLabel } from '@/lib/place-labels';

const icon = (name: string, primaryType: string, category?: 'sight' | 'food') => placeIcon({ name, primaryType, category });

describe('chains', () => {
  it('recognises McDonald’s however the name is written', () => {
    for (const name of ['McDonald’s Roma Giolitti', "McDonald's Roma Via Nazionale", 'MCDONALDS', 'Mc Donald\'s Termini', 'mcdonald´s']) {
      expect(brandOf(name, 'fast_food_restaurant')?.brand, name).toBe('McDonald’s');
    }
  });

  it('gives each chain its colours and initials', () => {
    expect(icon('Burger King Roma Termini', 'fast_food_restaurant')).toEqual({
      kind: 'brand', brand: 'Burger King', text: 'BK', background: '#d62300', color: '#f5ebdc',
    });
    expect(icon('KFC', 'restaurant')).toMatchObject({ kind: 'brand', brand: 'KFC', text: 'KFC' });
    expect(icon('Starbucks Reserve', 'coffee_shop')).toMatchObject({ kind: 'brand', brand: 'Starbucks' });
    expect(icon('Domino’s Pizza', 'pizza_restaurant')).toMatchObject({ kind: 'brand', brand: 'Domino’s' });
    expect(icon('Trapizzino | Mercato Centrale Roma', 'fast_food_restaurant')).toMatchObject({ kind: 'brand', brand: 'Trapizzino' });
  });

  it('matches chains only among places to eat and drink', () => {
    expect(brandOf('Subway', 'subway_station')).toBeNull();
    expect(brandOf('Subway', 'sandwich_shop')?.brand).toBe('Subway');
    expect(brandOf('Burger King', 'parking')).toBeNull();
  });

  it('does not see a chain in a longer word', () => {
    expect(brandOf('Gromma Osteria', 'restaurant')).toBeNull();
    expect(brandOf('Kfcasa bistrot', 'restaurant')).toBeNull();
    expect(brandOf('Pizzeria Da Michele', 'pizza_restaurant')).toBeNull();
  });

  it('normalises accents, apostrophes and punctuation', () => {
    expect(normaliseName('  Caffè  Sant’Eustachio! ')).toBe('caffe santeustachio');
  });
});

describe('categories', () => {
  it('uses the most specific glyph for food', () => {
    expect(icon('Da Remo', 'pizza_restaurant')).toEqual({ kind: 'category', glyph: '🍕' });
    expect(icon('Giolitti', 'ice_cream_shop')).toEqual({ kind: 'category', glyph: '🍨' });
    expect(icon('Sant’Eustachio', 'coffee_shop')).toEqual({ kind: 'category', glyph: '☕' });
    expect(icon('Il Goccetto', 'wine_bar')).toEqual({ kind: 'category', glyph: '🍷' });
    expect(icon('Roscioli', 'bakery')).toEqual({ kind: 'category', glyph: '🥐' });
    expect(icon('Armando al Pantheon', 'italian_restaurant')).toEqual({ kind: 'category', glyph: '🍝' });
    expect(icon('Saravanaa Bhavan', 'indian_restaurant')).toEqual({ kind: 'category', glyph: '🍛' });
  });

  it('uses the glyph of what a sight is', () => {
    expect(icon('Sant’Ignazio', 'church')).toEqual({ kind: 'category', glyph: '⛪' });
    expect(icon('Fontana di Trevi', 'fountain')).toEqual({ kind: 'category', glyph: '⛲' });
    expect(icon('Galleria Doria Pamphilj', 'art_gallery')).toEqual({ kind: 'category', glyph: '🎨' });
    expect(icon('Castel Sant’Angelo', 'castle')).toEqual({ kind: 'category', glyph: '🏰' });
  });

  it('falls back to the category of the pin', () => {
    expect(icon('Pantheon', 'historical_landmark', 'sight')).toEqual({ kind: 'category', glyph: '🏛️' });
    expect(icon('Qualcosa', 'point_of_interest', 'food')).toEqual({ kind: 'category', glyph: '🍽️' });
  });
});

describe('type labels', () => {
  it('names types in Italian', () => {
    expect(placeTypeLabel('fast_food_restaurant')).toBe('Fast food');
    expect(placeTypeLabel('fountain')).toBe('Fontana');
    expect(placeTypeLabel('plaza')).toBe('Piazza');
  });

  it('never falls back to English', () => {
    expect(placeTypeLabel('peruvian_restaurant')).toBe('Ristorante');
    expect(placeTypeLabel('wax_museum')).toBe('Museo');
    expect(placeTypeLabel('shoe_store')).toBe('Negozio');
    expect(placeTypeLabel('something_new')).toBe('Luogo di interesse');
  });
});
