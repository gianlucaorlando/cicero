'use client';

import { useCallback, useEffect, useState, type SubmitEvent } from 'react';

import { ConversationPanel, type QuickPrompt } from '@/components/cicero/conversation-panel';
import { LocationSheet } from '@/components/cicero/location-sheet';
import { MapStage } from '@/components/cicero/map-stage';
import { ProfileSheet, type ManualPreferenceKey } from '@/components/cicero/profile-sheet';
import { RouteDetailSheet } from '@/components/cicero/route-detail-sheet';
import { SavedRoutesSheet } from '@/components/cicero/saved-routes-sheet';
import { useAuth0 } from '@/hooks/use-auth0';
import { useConversation, type ChatMode } from '@/hooks/use-conversation';
import { useLocation } from '@/hooks/use-location';
import { useProfileSync } from '@/hooks/use-profile-sync';
import { useSavedRoutes } from '@/hooks/use-saved-routes';
import { useSpeechInput } from '@/hooks/use-speech-input';
import { useWeather } from '@/hooks/use-weather';
import { candidateLetter, localTimeLabel, pluralStops } from '@/lib/format';
import { itinerarySignature } from '@/lib/geo';
import type { PreferenceCategory } from '@/lib/profile';
import type { PlaceCandidate, SavedRoute } from '@/lib/types';

const quickPrompts: QuickPrompt[] = [
  { label: 'Cosa faccio adesso?', text: 'Cosa faccio adesso? Ho un paio d’ore libere.' },
  { label: 'Caffè qui vicino', text: 'Trova un caffè qui vicino.' },
  { label: 'Shopping', text: 'Vorrei fare un po’ di shopping.' },
  { label: 'Ritmo tranquillo', text: 'Preferisco un ritmo tranquillo: poche tappe e più margine.' },
  { label: 'Qualcosa al coperto', text: 'Piove: proponimi qualcosa al coperto.' },
];

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
  const location = useLocation(conversation.notify);
  const weather = useWeather(location.coords);
  const savedRoutes = useSavedRoutes({ authStatus: auth.status, getAccessToken: auth.getAccessToken });

  const [input, setInput] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [routeFocusToken, setRouteFocusToken] = useState(0);

  const speech = useSpeechInput(useCallback((transcript: string) => setInput(transcript), []));

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  const { profile } = profileSync;
  const { itinerary, candidates } = conversation;
  const { city, locationLabel, coords } = location;

  const ask = useCallback((text: string) => conversation.send(text, {
    city,
    locationLabel,
    origin: coords,
    weather,
    localTime: localTimeLabel(),
    profile,
  }), [city, conversation, coords, locationLabel, profile, weather]);

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
    const index = candidates.findIndex((item) => item.id === candidate.id);
    void ask(`Aggiungi ${index >= 0 ? `l’opzione ${candidateLetter(index)}, ` : ''}${candidate.name}.`);
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
    if (route) conversation.notify('Percorso salvato nel tuo profilo. Potrai riaprirlo dalla raccolta in alto.', 'Itinerario sincronizzato');
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

  const prompts = conversation.awaitingConsent
    ? [{ label: 'Sì, proponilo', text: 'Sì, proponimi un itinerario.' }, ...quickPrompts]
    : quickPrompts;

  return (
    <main className={`app-shell ${mapOpen ? '' : 'map-collapsed'}`}>
      <MapStage
        coords={coords}
        onMovePin={location.movePin}
        stops={itinerary}
        candidates={candidates}
        onSelectCandidate={selectCandidate}
        selectionDisabled={conversation.thinking}
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
        candidates={candidates}
        onSelectCandidate={selectCandidate}
        itinerary={itinerary}
        onRemoveStop={conversation.removeStop}
        quickPrompts={prompts}
        onQuickPrompt={(text) => void ask(text)}
        input={input}
        onInputChange={setInput}
        onSubmit={submitMessage}
        speech={speech}
        footerNote={footerNotes[conversation.mode]}
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
    </main>
  );
}
