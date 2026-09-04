import type { PreferenceCategory, Profile } from '@/lib/profile';

export type LatLng = { lat: number; lng: number };

export type StopKind = 'coffee' | 'place' | 'walk';

/** A verified itinerary stop. Every stop comes from Google Places and carries coordinates. */
export type Stop = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: StopKind;
  placeId?: string;
  primaryType?: string;
  address?: string;
  lat: number;
  lng: number;
  googleMapsUri?: string | null;
  source?: 'google_places';
};

export type TripadvisorSummary = {
  locationId: string;
  rating: number;
  reviewCount: number;
  ratingImageUrl: string;
  webUrl: string;
};

export type PlaceCandidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
  businessStatus: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  distanceMeters: number;
  tripadvisor: TripadvisorSummary | null;
};

export type PlaceDetails = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType: string;
  businessStatus: string | null;
  openNow: boolean | null;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  weekdayDescriptions: string[];
  priceLevel: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
};

export type SavedRoute = {
  id: string;
  name: string;
  city: string;
  locationLabel: string;
  origin: LatLng;
  stops: Stop[];
  createdAt: string;
  updatedAt: string;
};

export type ChatRole = 'assistant' | 'user';

export type ChatMessage = {
  id: number;
  role: ChatRole;
  text: string;
  meta?: string;
};

/** What the client sends to the agent on every turn. */
export type ChatContext = {
  city: string;
  locationLabel: string;
  origin: LatLng;
  weather: string;
  localTime: string;
  itinerary: Stop[];
  candidates: PlaceCandidate[];
  profile: Profile;
};

export type ChatRequest = {
  messages: Array<{ role: ChatRole; text: string }>;
  context: ChatContext;
};

export type ProfilePatch = {
  slowPace?: boolean;
  avoidQueues?: boolean;
  noFish?: boolean;
  markets?: boolean;
  learn?: Array<{ category: PreferenceCategory; value: string }>;
  forget?: Array<{ category: PreferenceCategory; value: string }>;
};

/** Side effects the agent asks the client to apply after a turn. */
export type ChatAction =
  | { type: 'show_candidates'; candidates: PlaceCandidate[] }
  | { type: 'add_stops'; stops: Stop[] }
  | { type: 'remove_stops'; stopIds: string[] }
  | { type: 'shift_times'; minutes: number }
  | { type: 'update_profile'; patch: ProfilePatch };

export type ChatResponse = {
  reply: string;
  meta?: string;
  actions: ChatAction[];
};
