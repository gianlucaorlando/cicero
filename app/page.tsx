'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';

import { ConversationPanel } from '@/components/cicero/conversation-panel';
import { LocationSheet } from '@/components/cicero/location-sheet';
import { MapStage } from '@/components/cicero/map-stage';
import { PlacePopup, type PopupAction } from '@/components/cicero/place-popup';
import { PlaceSheet } from '@/components/cicero/place-sheet';
import { ProfileSheet, type ManualPreferenceKey } from '@/components/cicero/profile-sheet';
import { RouteDetailSheet } from '@/components/cicero/route-detail-sheet';
import { SavedRoutesSheet } from '@/components/cicero/saved-routes-sheet';
import { TestPanel } from '@/components/cicero/test-panel';
import { useAuth0 } from '@/hooks/use-auth0';
import { useDiscovery } from '@/hooks/use-discovery';
import { useExplore } from '@/hooks/use-explore';
import { relocationEvent, useConversation, type ChatMode, type TurnContext } from '@/hooks/use-conversation';
import { useLocation, type Relocation } from '@/hooks/use-location';
import { useProfileSync } from '@/hooks/use-profile-sync';
import { useSavedRoutes } from '@/hooks/use-saved-routes';
import { useSpeechInput } from '@/hooks/use-speech-input';
import { useWeather } from '@/hooks/use-weather';
import type { StopRemoval } from '@/lib/conversation-state';
import { mergePlaces, selectVisiblePins, type Viewport } from '@/lib/explore';
import { candidateLetter, localTimeLabel, pluralStops } from '@/lib/format';
import { itinerarySignature } from '@/lib/geo';
import type { PreferenceCategory, Profile } from '@/lib/profile';
import type { DiscoveryPlace, PlaceCandidate, SavedRoute } from '@/lib/types';

function hideSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash || splash.classList.contains('is-hidden')) return;
  splash.classList.add('is-hidden');
  window.setTimeout(() => splash.remove(), 400);
}

/** How long "Annulla" stays available after the user takes a stop out of the route. */
const UNDO_REMOVAL_MS = 8000;

/** One shared empty list: a fresh [] on every render would re-frame the map each time. */
const NO_PLACES: PlaceCandidate[] = [];

const footerNotes: Record<ChatMode, string> = {
  unknown: 'Claude + Google Places · nessun luogo inventato',
  ready: 'Claude + Google Places · nessun luogo inventato',
  missing: 'Modello non configurato · chiave server richiesta',
  error: 'Modello temporaneamente non disponibile',
};

export default function Home() {
  const auth = useAuth0();
  const profileSync = useProfileSync({ authStatus: auth.status, getAccessToken: auth.getAccessToken });
  const conversation = useConversation(profileSync.applyPatch);
  // The relocation handler needs location state that does not exist yet at this point: route it through a ref.
  const relocateRef = useRef<(relocation: Relocation) => void>(() => undefined);
  const onRelocated = useCallback((relocation: Relocation) => relocateRef.current(relocation), []);
  const location = useLocation({ notify: conversation.notify, onRelocated });
  const { label: weather, ready: weatherReady } = useWeather(location.coords);
  const discovery = useDiscovery(location.coords);
  /** The area on screen, reported by the map after every pan or zoom. */
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const explored = useExplore(viewport);
  const savedRoutes = useSavedRoutes({ authStatus: auth.status, getAccessToken: auth.getAccessToken });

  const [input, setInput] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [routeFocusToken, setRouteFocusToken] = useState(0);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  /** Id of the proposal whose alternatives are expanded; a new proposal collapses them again. */
  const [alternativesOpenFor, setAlternativesOpenFor] = useState<string | null>(null);
  /** Place whose detail sheet is open: from the proposal card, or "Dettagli" in a popup. */
  const [detailPlace, setDetailPlace] = useState<PlaceCandidate | null>(null);
  /** Place whose compact popup is open on the map, after a tap on its pin. */
  const [popupPlaceId, setPopupPlaceId] = useState<string | null>(null);
  /** While the test panel runs it works on this profile, so the real one is never written. */
  const [testProfile, setTestProfile] = useState<Profile | null>(null);
  /** The stop the user just took out by hand, kept for a few seconds so a mistaken tap can be undone. */
  const [removal, setRemoval] = useState<StopRemoval | null>(null);

  const speech = useSpeechInput(useCallback((transcript: string) => setInput(transcript), []));

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  // Splash screen (rendered by the layout): dismissed when the map is ready, or after a safety timeout.
  useEffect(() => {
    const timeout = window.setTimeout(hideSplash, 4000);
    return () => window.clearTimeout(timeout);
  }, []);

  // Hidden GUI test runner: opt in with ?test=1, and only where the server allows it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('test') !== '1') return;
    fetch('/api/test-panel', { cache: 'no-store' })
      .then((response) => { if (response.status === 204) setTestPanelOpen(true); })
      .catch(() => undefined);
  }, []);

  const { profile: syncedProfile } = profileSync;
  const profile = testProfile ?? syncedProfile;
  const { itinerary, candidates, listed, proposal, routeProposal, suggestions } = conversation;
  const routePreview = routeProposal?.stops ?? NO_PLACES;
  const alternativesOpen = proposal !== null && alternativesOpenFor === proposal.candidate.id;
  /**
   * Pins on the map: only the proposed one while a proposal stands, all of them
   * when the alternatives are open or the agent showed the list, none otherwise.
   * Memoised because a new array identity re-centres the map on every keystroke.
   */
  const visibleCandidates = useMemo(() => {
    if (proposal) return alternativesOpen ? candidates : candidates.slice(0, 1);
    return listed ? candidates : [];
  }, [alternativesOpen, candidates, listed, proposal]);
  const { city, locationLabel, coords } = location;

  // A route emptied while its sheet was open closes the sheet for good, instead of
  // leaving it armed to pop open by itself with the next stop.
  if (routeOpen && !itinerary.length && !removal) setRouteOpen(false);

  // "Annulla" is a safety net for a mistaken tap, not a history: it lapses after a few seconds.
  useEffect(() => {
    if (!removal) return;
    const timeout = window.setTimeout(() => setRemoval(null), UNDO_REMOVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [removal]);

  function removeStop(stopId: string) {
    const index = itinerary.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    setRemoval({ stop: itinerary[index], index });
    conversation.removeStop(stopId);
  }

  function undoRemoval() {
    if (!removal) return;
    conversation.restoreStop(removal);
    setRemoval(null);
  }

  /**
   * Points of interest on the map: the landing ones plus those found while
   * exploring, chosen for the area on screen (more when zoomed out, fewer when
   * zoomed in). A stop, a proposal or a stop of a proposed walk has its own pin.
   */
  const discoveryPins = useMemo(() => {
    const hidden = new Set([
      ...itinerary.map((stop) => stop.placeId || stop.id),
      ...visibleCandidates.map((candidate) => candidate.id),
      ...routePreview.map((stop) => stop.id),
    ]);
    const pool = mergePlaces(discovery.places, explored);
    return viewport
      ? selectVisiblePins(pool, viewport, hidden, discovery.area?.kind ?? null)
      : pool.filter((place) => !hidden.has(place.id));
  }, [discovery.area, discovery.places, explored, itinerary, routePreview, viewport, visibleCandidates]);

  /** What Cicerone knows is on the map: the pins on screen first, then the landing ones (the server keeps 12). */
  const contextPlaces = useMemo(() => {
    const shown = new Set(discoveryPins.map((place) => place.id));
    return [...discoveryPins, ...discovery.places.filter((place) => !shown.has(place.id))];
  }, [discovery.places, discoveryPins]);

  const buildContext = useCallback((overrides: Partial<TurnContext> = {}): TurnContext => ({
    city,
    locationLabel,
    origin: coords,
    weather,
    localTime: localTimeLabel(),
    profile,
    discovery: contextPlaces,
    area: discovery.area,
    ...overrides,
  }), [city, contextPlaces, coords, discovery.area, locationLabel, profile, weather]);

  const ask = useCallback((text: string) => conversation.send(text, buildContext()), [buildContext, conversation]);

  // App-generated events (opening move, relocation) wait for the weather of the point they describe,
  // with a short deadline so a slow forecast never blocks Cicerone's first move.
  const [pendingEvent, setPendingEvent] = useState<{ kind: 'opening' } | { kind: 'relocation'; relocation: Relocation } | null>(null);
  const kickedOff = useRef(false);

  useEffect(() => {
    relocateRef.current = (relocation) => setPendingEvent({ kind: 'relocation', relocation });
  }, []);

  useEffect(() => {
    if (kickedOff.current || !profileSync.ready) return;
    // The test panel drives the conversation itself, including the opening move.
    if (new URLSearchParams(window.location.search).get('test') === '1') return;
    const timeout = window.setTimeout(() => {
      kickedOff.current = true;
      setPendingEvent({ kind: 'opening' });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [profileSync.ready]);

  useEffect(() => {
    // A turn already in flight would reject the event: keep it queued until the reply lands.
    if (!pendingEvent || conversation.thinking) return;
    const fire = () => {
      setPendingEvent(null);
      if (pendingEvent.kind === 'opening') {
        void conversation.start(buildContext());
        return;
      }
      const { relocation } = pendingEvent;
      void conversation.send(
        relocationEvent(relocation.label, relocation.city),
        buildContext({ city: relocation.city, locationLabel: relocation.label, origin: relocation.coords }),
        { hidden: true },
      );
    };
    // Weather and points of interest describe the new point; wait for both, but never more than 3 s.
    const timeout = window.setTimeout(fire, weatherReady && discovery.ready ? 0 : 3000);
    return () => window.clearTimeout(timeout);
  }, [buildContext, conversation, conversation.thinking, discovery.ready, pendingEvent, weatherReady]);

  const currentSignature = itinerarySignature(city, locationLabel, coords, itinerary);
  const currentRouteSaved = Boolean(itinerary.length && savedRoutes.savedSignature === currentSignature);

  const preferenceCount = [profile.slowPace, profile.avoidQueues, profile.noFish, profile.markets].filter(Boolean).length
    + Object.values(profile.learned).reduce((total, values) => total + values.length, 0);
  const displayName = auth.user?.name || auth.user?.nickname || auth.user?.email || 'Il tuo profilo';
  const initials = auth.status === 'authenticated'
    ? displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : '';

  function submitMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value || conversation.thinking) return;
    setInput('');
    void ask(value);
  }

  function selectCandidate(candidate: PlaceCandidate) {
    setDetailPlace(null);
    if (proposal && candidate.id === proposal.candidate.id) {
      void ask('Sì, aggiungila.');
      return;
    }
    const index = candidates.findIndex((item) => item.id === candidate.id);
    const letter = index >= 0 ? ` (${candidateLetter(index)})` : '';
    void ask(proposal ? `Preferisco ${candidate.name}${letter}: aggiungi quella.` : `Aggiungi ${candidate.name}${letter}.`);
  }

  const detailIsProposal = detailPlace !== null && proposal !== null && detailPlace.id === proposal.candidate.id;

  function addDiscovery(place: DiscoveryPlace) {
    setPopupPlaceId(null);
    setDetailPlace(null);
    // The tapped place goes first in the context, so Cicerone has its id whatever else is on the map.
    const discoveryFirst = [place, ...contextPlaces.filter((item) => item.id !== place.id)];
    void conversation.send(`Aggiungi ${place.name} al percorso.`, buildContext({ discovery: discoveryFirst }));
  }

  function acceptRoute() {
    setDetailPlace(null);
    if (routeProposal) void ask('Sì, approvo il percorso.');
  }

  function declineRoute() {
    setDetailPlace(null);
    if (routeProposal) void ask('No, grazie: niente giro.');
  }

  /** The one action a place offers, wherever it is opened: accept, choose, approve the walk or add. */
  function primaryActionFor(place: PlaceCandidate): (PopupAction & { onDecline?: () => void; declineLabel?: string }) | null {
    if (proposal && place.id === proposal.candidate.id) {
      return { label: 'Sì, aggiungila', kind: 'accept', onClick: acceptProposal, onDecline: declineProposal };
    }
    if (routePreview.some((stop) => stop.id === place.id)) {
      return { label: 'Approva il percorso', kind: 'accept', onClick: acceptRoute, onDecline: declineRoute, declineLabel: 'No, grazie' };
    }
    // A pin on the map reads as "add it", even when the place also sits among a proposal's hidden alternatives.
    const poi = discoveryPins.find((item) => item.id === place.id);
    if (poi) return { label: 'Aggiungi al percorso', kind: 'add', onClick: () => addDiscovery(poi) };
    if (candidates.some((item) => item.id === place.id)) return { label: 'Scegli questo', kind: 'accept', onClick: () => selectCandidate(place) };
    return null;
  }

  const popupPlace = useMemo(() => [...visibleCandidates, ...routePreview, ...discoveryPins].find((place) => place.id === popupPlaceId) ?? null,
    [discoveryPins, popupPlaceId, routePreview, visibleCandidates]);
  const popupPrimary = popupPlace ? primaryActionFor(popupPlace) : null;
  const mapPopup = popupPlace ? {
    key: popupPlace.id,
    lat: popupPlace.lat,
    lng: popupPlace.lng,
    // Proposal pins are tall teardrops; point-of-interest icons are centred discs.
    lift: visibleCandidates.some((candidate) => candidate.id === popupPlace.id) ? 52 : 22,
    content: (
      <PlacePopup
        place={popupPlace}
        primary={popupPrimary && {
          ...popupPrimary,
          onClick: () => {
            setPopupPlaceId(null);
            popupPrimary.onClick();
          },
        }}
        busy={conversation.thinking}
        onDetails={() => {
          setPopupPlaceId(null);
          setDetailPlace(popupPlace);
        }}
      />
    ),
  } : null;
  const detailPrimary = detailPlace ? primaryActionFor(detailPlace) : null;

  function acceptProposal() {
    setDetailPlace(null);
    if (proposal) void ask('Sì, aggiungila.');
  }

  function declineProposal() {
    setDetailPlace(null);
    if (proposal) void ask('No, proponimi un’altra.');
  }

  function toggleAlternatives() {
    if (proposal) setAlternativesOpenFor((current) => (current === proposal.candidate.id ? null : proposal.candidate.id));
  }

  function submitCity(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void location.findLocation(location.cityInput).finally(() => setLocationOpen(false));
  }

  function submitAddress(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void location.findLocation(location.addressInput);
  }

  function toggleManualPreference(key: ManualPreferenceKey) {
    profileSync.setProfile((current) => ({ ...current, [key]: !current[key] }));
  }

  function forgetPreference(category: PreferenceCategory, value: string) {
    profileSync.applyPatch({ forget: [{ category, value }] });
  }

  function openSavedRoutes() {
    setSavedRoutesOpen(true);
    void savedRoutes.load();
  }

  async function saveCurrentRoute() {
    if (!itinerary.length) return;
    if (auth.status === 'anonymous') {
      void auth.login();
      return;
    }
    const dateLabel = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    const route = await savedRoutes.save({
      name: `${city} · ${dateLabel}`,
      city,
      locationLabel,
      origin: coords,
      stops: itinerary,
      signature: currentSignature,
    });
    if (!route) return;
    if (route.device) {
      conversation.notify('Percorso salvato su questo dispositivo. Lo ritrovi nella raccolta in alto.', 'Salvato in locale');
    } else {
      conversation.notify('Percorso salvato nel tuo profilo. Potrai riaprirlo dalla raccolta in alto.', 'Itinerario sincronizzato');
    }
  }

  function loadSavedRoute(route: SavedRoute) {
    location.applySavedRoute(route);
    conversation.replaceItinerary(route.stops);
    savedRoutes.markActive(route, itinerarySignature(route.city, route.locationLabel, route.origin, route.stops));
    setSavedRoutesOpen(false);
    setMapOpen(true);
    setRouteFocusToken((value) => value + 1);
    conversation.notify(`Ho riaperto “${route.name}” con ${pluralStops(route.stops.length)}.`, 'Percorso caricato dal profilo');
  }

  return (
    // A pending yes/no (a proposal or a walk) gets half the phone: its card and buttons must fit.
    <main className={`app-shell ${mapOpen ? '' : 'map-collapsed'} ${proposal || routeProposal ? 'deciding' : ''}`}>
      <MapStage
        coords={coords}
        onMovePin={location.movePin}
        stops={itinerary}
        candidates={visibleCandidates}
        onOpenCandidate={(candidate) => setPopupPlaceId(candidate.id)}
        discovery={discoveryPins}
        onOpenDiscovery={(place) => setPopupPlaceId(place.id)}
        routePreview={routePreview}
        onViewportChange={setViewport}
        popup={mapPopup}
        onPopupClose={() => setPopupPlaceId(null)}
        focusToken={routeFocusToken}
        city={city}
        locationLabel={locationLabel}
        weather={weather}
        addressInput={location.addressInput}
        onAddressInputChange={location.setAddressInput}
        onSearchAddress={submitAddress}
        locating={location.locating}
        onUseCurrentLocation={location.useCurrentLocation}
        onOpenLocation={() => setLocationOpen(true)}
        onOpenRoute={() => {
          setRouteFocusToken((value) => value + 1);
          setRouteOpen(true);
        }}
        savedRoutesCount={savedRoutes.routes.length}
        onOpenSavedRoutes={openSavedRoutes}
        profileInitials={initials}
        onOpenProfile={() => setProfileOpen(true)}
        onMapReady={hideSplash}
      />

      <ConversationPanel
        mapOpen={mapOpen}
        onToggleMap={() => setMapOpen((value) => !value)}
        city={city}
        origin={coords}
        preferenceCount={preferenceCount}
        onOpenProfile={() => setProfileOpen(true)}
        messages={conversation.messages}
        thinking={conversation.thinking}
        proposal={proposal}
        onAcceptProposal={acceptProposal}
        onDeclineProposal={declineProposal}
        routeProposal={routeProposal}
        onAcceptRoute={acceptRoute}
        onDeclineRoute={declineRoute}
        alternativesOpen={alternativesOpen}
        onToggleAlternatives={toggleAlternatives}
        onOpenPlace={setDetailPlace}
        candidates={candidates}
        listed={listed}
        onSelectCandidate={selectCandidate}
        itinerary={itinerary}
        onRemoveStop={removeStop}
        stopRemoval={removal}
        onUndoRemoveStop={undoRemoval}
        suggestions={suggestions}
        onSuggestion={(text) => void ask(text)}
        input={input}
        onInputChange={setInput}
        onSubmit={submitMessage}
        speech={speech}
        footerNote={footerNotes[conversation.mode]}
      />

      <PlaceSheet
        place={detailPlace}
        reason={detailIsProposal ? proposal?.reason : undefined}
        actions={detailPrimary ? {
          acceptLabel: detailPrimary.label,
          onAccept: detailPrimary.onClick,
          onDecline: detailPrimary.onDecline,
          declineLabel: detailPrimary.declineLabel,
        } : undefined}
        busy={conversation.thinking}
        onOpenChange={(open) => { if (!open) setDetailPlace(null); }}
      />

      <RouteDetailSheet
        open={routeOpen}
        onOpenChange={setRouteOpen}
        itinerary={itinerary}
        coords={coords}
        city={city}
        locationLabel={locationLabel}
        saved={currentRouteSaved}
        saveStatus={savedRoutes.saveStatus}
        authStatus={auth.status}
        onSave={() => void saveCurrentRoute()}
        onRemoveStop={removeStop}
        removed={removal}
        onUndo={undoRemoval}
      />

      <SavedRoutesSheet
        open={savedRoutesOpen}
        onOpenChange={setSavedRoutesOpen}
        authStatus={auth.status}
        status={savedRoutes.status}
        routes={savedRoutes.routes}
        deletingId={savedRoutes.deletingId}
        onLogin={() => void auth.login()}
        onRetry={() => void savedRoutes.load()}
        onLoad={loadSavedRoute}
        onDelete={(routeId) => void savedRoutes.remove(routeId)}
      />

      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        authStatus={auth.status}
        user={auth.user}
        displayName={displayName}
        initials={initials}
        profile={profile}
        editable={profileSync.editable}
        status={profileSync.status}
        onLogin={() => void auth.login()}
        onLogout={() => void auth.logout()}
        onToggle={toggleManualPreference}
        onForget={forgetPreference}
      />

      <LocationSheet
        open={locationOpen}
        onOpenChange={setLocationOpen}
        cityInput={location.cityInput}
        onCityInputChange={location.setCityInput}
        onSubmit={submitCity}
        locating={location.locating}
        onUseCurrentLocation={location.useCurrentLocation}
      />

      {testPanelOpen && (
        <TestPanel
          ask={ask}
          start={() => conversation.start(buildContext())}
          itinerary={itinerary}
          candidates={candidates}
          proposal={proposal}
          routeProposal={routeProposal}
          suggestions={suggestions}
          profile={profile}
          setProfile={setTestProfile}
          reset={conversation.reset}
          onClose={() => setTestPanelOpen(false)}
        />
      )}
    </main>
  );
}
