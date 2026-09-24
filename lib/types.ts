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
};

export type DiscoveryCategory = 'sight' | 'food';

/** A point of interest shown on the map as soon as the app opens. */
export type DiscoveryPlace = PlaceCandidate & { category: DiscoveryCategory };

/**
 * Where the user is standing, which decides the mix of points of interest.
 * The two conditions can hold together: a station can sit in a touristic area.
 */
export type AreaKind = 'transit' | 'touristic' | 'transit-touristic' | 'ordinary';

export type AreaInfo = { kind: AreaKind; hub: string | null };

export type Discovery = { places: DiscoveryPlace[]; area: AreaInfo };

/**
 * A walk through the sights around one the user just chose, offered as a whole:
 * one "sì" adds every stop, in this order.
 */
export type RouteProposal = {
  /** The sight just added: the walk starts there. */
  anchor: { id: string; name: string; lat: number; lng: number };
  /** The other sights, in walking order. */
  stops: PlaceCandidate[];
  /** Walking distance from the anchor through every stop, as the crow flies. */
  distanceMeters: number;
};

export type ReviewSource = 'google' | 'tripadvisor';

/** One review as written by a traveller, with what each source requires to show it. */
export type PlaceReview = {
  id: string;
  source: ReviewSource;
  author: string;
  /** Link to the author's profile (Google requires crediting authors with it). */
  authorUri: string | null;
  authorPhotoUri: string | null;
  /** 1 to 5. */
  rating: number | null;
  title: string | null;
  /** In Italian when the source provides a translation, otherwise as written. */
  text: string;
  /** The text as written, when `text` is a translation. */
  originalText: string | null;
  publishedAt: string | null;
  /** The source's own "3 mesi fa", used when there is no exact date. */
  relativeTime: string | null;
  /** The review on the source's site. */
  reviewUri: string | null;
  /** Where to report the review (Google). */
  flagUri: string | null;
};

export type ReviewSummary = { rating: number | null; count: number | null; url: string | null };

/**
 * Reviews for one place. A source is null when it is not configured or does
 * not know the place; its list is empty when it has no reviews.
 */
export type PlaceReviews = {
  placeId: string;
  google: (ReviewSummary & { reviews: PlaceReview[] }) | null;
  tripadvisor: (ReviewSummary & { reviews: PlaceReview[] }) | null;
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
  /** Kept only on this device, because the server could not tell who the user is. */
  device?: boolean;
};

export type ChatRole = 'assistant' | 'user';

export type ChatMessage = {
  id: number;
  role: ChatRole;
  text: string;
  meta?: string;
  /** App-generated event (opening, relocation): sent to the model as a user turn but never rendered. */
  hidden?: boolean;
};

/** What the client sends to the agent on every turn. */
export type ChatContext = {
  city: string;
  locationLabel: string;
  origin: LatLng;
  weather: string;
  localTime: string;
  itinerary: Stop[];
  /** Places found by the last search: the current proposal first, then its alternatives. */
  candidates: PlaceCandidate[];
  /** Whether candidates[0] is being proposed to the user right now. */
  proposing: boolean;
  profile: Profile;
  /** Points of interest already on the map since the app opened. */
  discovery?: DiscoveryPlace[];
  /** Kind of area around the origin: transit hub, touristic, both or neither. */
  area?: AreaInfo | null;
  /** A walk through nearby sights, waiting for the user's approval. */
  routeProposal?: RouteProposal | null;
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

/** One concrete suggestion the user can accept with a tap. Alternatives stay available on request. */
export type Proposal = {
  candidate: PlaceCandidate;
  reason: string;
  alternatives: PlaceCandidate[];
};

/** Side effects the agent asks the client to apply after a turn. */
export type ChatAction =
  | { type: 'set_candidates'; candidates: PlaceCandidate[] }
  | { type: 'show_candidates'; candidates: PlaceCandidate[] }
  | { type: 'propose'; proposal: Proposal }
  | { type: 'propose_route'; route: RouteProposal }
  | { type: 'dismiss_proposal' }
  | { type: 'suggest_replies'; replies: string[] }
  | { type: 'add_stops'; stops: Stop[] }
  | { type: 'remove_stops'; stopIds: string[] }
  | { type: 'shift_times'; minutes: number }
  | { type: 'set_itinerary'; stops: Stop[] }
  | { type: 'update_profile'; patch: ProfilePatch };

export type ChatResponse = {
  reply: string;
  meta?: string;
  actions: ChatAction[];
};
