import { isFoodType } from '@/lib/place-kinds';

/**
 * The icon a place gets on the map. Chains are recognisable at a glance by
 * their colours and initials (not their logos: those are trademarks and
 * would need the owner's artwork); every other place gets the glyph of what
 * it is: a pizzeria, an ice-cream shop, a church, a fountain.
 */
export type PlaceIcon =
  | { kind: 'brand'; brand: string; text: string; background: string; color: string }
  | { kind: 'category'; glyph: string };

type Brand = { brand: string; pattern: RegExp; text: string; background: string; color: string };

/** Matched on the normalised name: lower case, no accents, no apostrophes. */
const BRANDS: Brand[] = [
  { brand: 'McDonald’s', pattern: /\bmc ?donalds?\b/, text: 'M', background: '#db0007', color: '#ffbc0d' },
  { brand: 'Burger King', pattern: /\bburger king\b/, text: 'BK', background: '#d62300', color: '#f5ebdc' },
  { brand: 'KFC', pattern: /\bkfc\b|\bkentucky fried\b/, text: 'KFC', background: '#e4002b', color: '#ffffff' },
  { brand: 'Starbucks', pattern: /\bstarbucks\b/, text: '★', background: '#00704a', color: '#ffffff' },
  { brand: 'Subway', pattern: /\bsubway\b/, text: 'S', background: '#008938', color: '#ffc600' },
  { brand: 'Domino’s', pattern: /\bdominos\b/, text: 'D', background: '#006491', color: '#ffffff' },
  { brand: 'Pizza Hut', pattern: /\bpizza hut\b/, text: 'PH', background: '#ee3124', color: '#ffffff' },
  { brand: 'Five Guys', pattern: /\bfive guys\b/, text: '5G', background: '#d21033', color: '#ffffff' },
  { brand: 'Old Wild West', pattern: /\bold wild west\b/, text: 'OWW', background: '#5b3a1f', color: '#f2c14e' },
  { brand: 'Roadhouse', pattern: /\broadhouse\b/, text: 'RH', background: '#b01e23', color: '#ffffff' },
  { brand: 'Poke House', pattern: /\bpoke house\b/, text: 'PH', background: '#00a19a', color: '#ffffff' },
  { brand: 'Spontini', pattern: /\bspontini\b/, text: 'SP', background: '#c8102e', color: '#ffffff' },
  { brand: 'Autogrill', pattern: /\bautogrill\b/, text: 'A', background: '#e30613', color: '#ffffff' },
  { brand: 'Rossopomodoro', pattern: /\brossopomodoro\b/, text: 'RP', background: '#c8102e', color: '#ffffff' },
  { brand: 'La Piadineria', pattern: /\bla piadineria\b/, text: 'LP', background: '#00843d', color: '#ffffff' },
  { brand: 'Alice Pizza', pattern: /\balice pizza\b/, text: 'AP', background: '#e2231a', color: '#ffffff' },
  { brand: 'Venchi', pattern: /\bvenchi\b/, text: 'V', background: '#3d2314', color: '#e7c27d' },
  { brand: 'Grom', pattern: /\bgrom\b/, text: 'G', background: '#1f1f1f', color: '#ffffff' },
  { brand: 'Eataly', pattern: /\beataly\b/, text: 'E', background: '#1f1f1f', color: '#ffffff' },
  { brand: 'Trapizzino', pattern: /\btrapizzino\b/, text: 'T', background: '#f2a900', color: '#3a2a12' },
];

export function normaliseName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9★]+/g, ' ')
    .trim();
}

/**
 * The chain a place belongs to, if any. Only places to eat and drink are
 * matched: "Subway" is also what some people call a metro station.
 */
export function brandOf(name: string, primaryType: string) {
  if (!isFoodType(primaryType)) return null;
  const normalised = normaliseName(name);
  return BRANDS.find((brand) => brand.pattern.test(normalised)) ?? null;
}

/** Most specific first: `pizza_restaurant` must win over `restaurant`. */
const CATEGORY_GLYPHS: Array<[RegExp, string]> = [
  [/pizza/, '🍕'],
  [/ice_cream|gelat/, '🍨'],
  [/coffee|cafe|tea_house/, '☕'],
  [/wine/, '🍷'],
  [/\bpub\b|^pub$|brewery|beer|\bbar\b|^bar$|_bar$|^bar_/, '🍺'],
  [/bakery|pastry|confectioner|dessert|cake/, '🥐'],
  [/hamburger|fast_food|burger/, '🍔'],
  [/sushi|japanese|ramen/, '🍣'],
  [/chinese|asian|thai|vietnamese|korean/, '🥢'],
  [/indian/, '🍛'],
  [/seafood|fish/, '🐟'],
  [/vegan|vegetarian|salad/, '🥗'],
  [/sandwich|deli/, '🥪'],
  [/steak|barbecue/, '🥩'],
  [/restaurant|food|meal|trattoria|osteria|diner|bistro/, '🍝'],
  [/church|basilica|cathedral|chapel|place_of_worship/, '⛪'],
  [/mosque|synagogue|temple|shrine/, '🕌'],
  [/art_gallery|art_museum|art_studio/, '🎨'],
  [/museum/, '🖼️'],
  [/fountain/, '⛲'],
  [/castle|fort|palace/, '🏰'],
  [/park|garden/, '🌳'],
  [/tower/, '🗼'],
  [/bridge/, '🌉'],
  [/sculpture|statue|monument|memorial/, '🗿'],
  [/observation_deck|viewpoint|scenic/, '🔭'],
];

export function placeIcon(place: { name: string; primaryType: string; category?: 'sight' | 'food' }): PlaceIcon {
  const brand = brandOf(place.name, place.primaryType);
  if (brand) return { kind: 'brand', brand: brand.brand, text: brand.text, background: brand.background, color: brand.color };
  const match = CATEGORY_GLYPHS.find(([pattern]) => pattern.test(place.primaryType));
  if (match) return { kind: 'category', glyph: match[1] };
  return { kind: 'category', glyph: place.category === 'food' ? '🍽️' : '🏛️' };
}
