export const preferenceCategories = ['cafe', 'evening', 'museum', 'restaurant'] as const;

export type PreferenceCategory = (typeof preferenceCategories)[number];
export type LearnedPreferences = Record<PreferenceCategory, string[]>;

export type Profile = {
  slowPace: boolean;
  avoidQueues: boolean;
  noFish: boolean;
  markets: boolean;
  learned: LearnedPreferences;
};

export function createEmptyProfile(): Profile {
  return {
    slowPace: false,
    avoidQueues: false,
    noFish: false,
    markets: false,
    learned: {
      cafe: [],
      evening: [],
      museum: [],
      restaurant: [],
    },
  };
}

function normalizeLearnedValues(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' ').slice(0, 60))
    .filter((item, index, values) => item.length > 0 && values.indexOf(item) === index)
    .slice(0, 4);
}

export function normalizeProfile(value: unknown): Profile {
  const source = value && typeof value === 'object' ? value as Partial<Profile> : {};
  const learned = source.learned && typeof source.learned === 'object'
    ? source.learned as Partial<LearnedPreferences>
    : {};

  return {
    slowPace: source.slowPace === true,
    avoidQueues: source.avoidQueues === true,
    noFish: source.noFish === true,
    markets: source.markets === true,
    learned: {
      cafe: normalizeLearnedValues(learned.cafe),
      evening: normalizeLearnedValues(learned.evening),
      museum: normalizeLearnedValues(learned.museum),
      restaurant: normalizeLearnedValues(learned.restaurant),
    },
  };
}
