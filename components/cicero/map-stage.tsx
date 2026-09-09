'use client';

import type { SubmitEvent } from 'react';
import { Bookmark, ChevronRight, CloudRain, LocateFixed, MapPin, Move, Navigation, Route, Search, Sun, UserRound } from 'lucide-react';

import { MapPicker } from '@/components/map-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pluralStops } from '@/lib/format';
import type { LatLng, PlaceCandidate, Stop } from '@/lib/types';

type Props = {
  coords: LatLng;
  onMovePin: (coords: LatLng) => void;
  stops: Stop[];
  candidates: PlaceCandidate[];
  onSelectCandidate: (candidate: PlaceCandidate) => void;
  selectionDisabled: boolean;
  focusToken: number;
  city: string;
  locationLabel: string;
  weather: string;
  addressInput: string;
  onAddressInputChange: (value: string) => void;
  onSearchAddress: (event: SubmitEvent<HTMLFormElement>) => void;
  locating: boolean;
  onUseCurrentLocation: () => void;
  onOpenLocation: () => void;
  onOpenRoute: () => void;
  savedRoutesCount: number;
  onOpenSavedRoutes: () => void;
  profileInitials: string;
  onOpenProfile: () => void;
  onMapReady: () => void;
};

export function MapStage({
  coords,
  onMovePin,
  stops,
  candidates,
  onSelectCandidate,
  selectionDisabled,
  focusToken,
  city,
  locationLabel,
  weather,
  addressInput,
  onAddressInputChange,
  onSearchAddress,
  locating,
  onUseCurrentLocation,
  onOpenLocation,
  onOpenRoute,
  savedRoutesCount,
  onOpenSavedRoutes,
  profileInitials,
  onOpenProfile,
  onMapReady,
}: Props) {
  return (
    <section className={`map-stage ${stops.length ? 'has-route' : ''} ${candidates.length ? 'has-candidates' : ''}`} aria-label="Mappa dell’itinerario">
      <MapPicker
        coords={coords}
        onChange={onMovePin}
        stops={stops}
        candidates={candidates}
        onSelectCandidate={(candidateId) => {
          const candidate = candidates.find((place) => place.id === candidateId);
          if (candidate && !selectionDisabled) onSelectCandidate(candidate);
        }}
        focusToken={focusToken}
        onReady={onMapReady}
      />
      <div className="map-wash" aria-hidden="true" />

      <header className="topbar">
        <div className="brand" aria-label="Cicero">
          <span className="brand-mark"><Navigation /></span>
          <span>Cicero</span>
        </div>
        <div className="topbar-actions">
          <Button className="saved-routes-button" variant="outline" size="icon" aria-label="Apri i percorsi salvati" onClick={onOpenSavedRoutes}>
            <Bookmark />
            {savedRoutesCount > 0 && <span>{savedRoutesCount}</span>}
          </Button>
          <Button className="profile-button" variant="outline" size="icon" aria-label="Apri il profilo" onClick={onOpenProfile}>
            {profileInitials || <UserRound />}
          </Button>
        </div>
      </header>

      <div className="context-strip" aria-label="Contesto attuale">
        <button className="context-button" type="button" onClick={onOpenLocation}>
          <MapPin /> {city} · {locationLabel} <ChevronRight />
        </button>
        <Badge className="context-pill weather" variant="secondary">
          {weather.includes('piove') ? <CloudRain /> : <Sun />} {weather}
        </Badge>
      </div>

      <form className="map-search" onSubmit={onSearchAddress}>
        <Search aria-hidden="true" />
        <Input
          value={addressInput}
          onChange={(event) => onAddressInputChange(event.target.value)}
          placeholder="Inserisci posizione o indirizzo"
          aria-label="Posizione o indirizzo"
          enterKeyHint="search"
        />
        <Button type="submit" size="icon" aria-label="Cerca sulla mappa" disabled={!addressInput.trim() || locating}>
          {locating ? <LocateFixed className="spin" /> : <ChevronRight />}
        </Button>
        <span className="map-search-hint"><Move /> Tieni premuto e trascina il pin</span>
      </form>

      {candidates.length > 0 ? (
        <div className="candidate-map-summary">
          <MapPin />
          {candidates.length === 1
            ? <div><strong>La proposta è sulla mappa</strong><span>Tocca il pin per aggiungerla</span></div>
            : <div><strong>{candidates.length} proposte sulla mappa</strong><span>Tocca un pin oppure scegli dall’elenco</span></div>}
        </div>
      ) : stops.length > 0 && (
        <button className="route-summary" type="button" onClick={onOpenRoute} aria-label="Apri il riepilogo del percorso">
          <span className="route-summary-icon"><Route /></span>
          <span className="route-summary-copy">
            <small>Il tuo percorso</small>
            <strong>Partenza + {pluralStops(stops.length)}</strong>
            <span>Segui i numeri sulla mappa</span>
          </span>
          <span className="route-steps" aria-hidden="true">
            <i className="route-step-origin"><MapPin /></i>
            {stops.slice(0, 3).map((stop, index) => <i key={stop.id}>{index + 1}</i>)}
            {stops.length > 3 && <em>+{stops.length - 3}</em>}
          </span>
        </button>
      )}

      <Button className="locate-button" variant="outline" size="icon-lg" aria-label="Usa la mia posizione" onClick={onUseCurrentLocation} disabled={locating}>
        <LocateFixed className={locating ? 'spin' : ''} />
      </Button>
    </section>
  );
}
