/**
 * Coarse kinds of place, read from Google's `primaryType`. Types are many and
 * grow over time (`catholic_church`, `historical_place`, `cultural_landmark`…),
 * so they are matched by the words they contain rather than listed one by one.
 */

const FOOD_WORDS = /restaurant|cafe|coffee|\bbar\b|_bar\b|^bar_|bakery|food|meal|pizza|ice_cream|gelat|dessert|pastry|confectioner|\bpub\b|bistro|brewery|winery|deli|sandwich|steak|trattoria|osteria|diner|buffet|tea_house|juice/;

const SIGHT_WORDS = /landmark|monument|church|place_of_worship|basilica|cathedral|chapel|mosque|synagogue|temple|shrine|museum|gallery|tourist_attraction|historical|historic|cultural|heritage|archaeological|ruins|castle|palace|fort|plaza|square|fountain|sculpture|statue|memorial|tower|bridge|observation_deck|amphitheat/;

/** Somewhere to eat or drink. */
export function isFoodType(primaryType: string | null | undefined) {
  return Boolean(primaryType) && FOOD_WORDS.test(primaryType!);
}

/** A monument, church, museum, square or other sight worth walking to. */
export function isSightType(primaryType: string | null | undefined) {
  return Boolean(primaryType) && SIGHT_WORDS.test(primaryType!) && !FOOD_WORDS.test(primaryType!);
}
