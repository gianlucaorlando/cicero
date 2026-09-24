import type { AreaKind, DiscoveryCategory } from '@/lib/types';

/**
 * How many sights and places to eat an area gets, shared by the landing
 * lookup (server) and the pins that follow the map (client):
 *
 *  - near a train station or an airport, food weighs more: people just
 *    arrived, often with luggage, and want to eat or sit down first;
 *  - in the centre or a touristic area, sights and attractions weigh more;
 *  - one never excludes the other: every mix keeps both kinds.
 */
export const MIX: Record<AreaKind, Record<DiscoveryCategory, number>> = {
  transit: { food: 5, sight: 3 },
  touristic: { sight: 5, food: 3 },
  'transit-touristic': { food: 4, sight: 4 },
  ordinary: { sight: 4, food: 4 },
};
