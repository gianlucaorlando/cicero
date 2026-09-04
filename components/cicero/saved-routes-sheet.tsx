'use client';

import { Bookmark, ChevronRight, LocateFixed, LogIn, Route, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Auth0Status } from '@/hooks/use-auth0';
import { pluralStops, savedRouteDate } from '@/lib/format';
import type { SavedRoute } from '@/lib/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authStatus: Auth0Status;
  status: 'error' | 'idle' | 'loading';
  routes: SavedRoute[];
  deletingId: string | null;
  onLogin: () => void;
  onRetry: () => void;
  onLoad: (route: SavedRoute) => void;
  onDelete: (routeId: string) => void;
};

export function SavedRoutesSheet({ open, onOpenChange, authStatus, status, routes, deletingId, onLogin, onRetry, onLoad, onDelete }: Props) {
  let body;
  if (authStatus === 'anonymous') {
    body = (
      <section className="saved-routes-login">
        <span className="auth-avatar"><Bookmark /></span>
        <div><strong>Accedi per salvare i percorsi</strong><small>Li ritroverai su tutti i tuoi dispositivi.</small></div>
        <Button type="button" size="sm" onClick={onLogin}><LogIn /> Accedi</Button>
      </section>
    );
  } else if (status === 'loading') {
    body = <p className="saved-routes-state"><LocateFixed className="spin" /> Carico i tuoi percorsi…</p>;
  } else if (status === 'error') {
    body = <button className="saved-routes-retry" type="button" onClick={onRetry}>Non riesco a caricarli. Tocca per riprovare.</button>;
  } else if (routes.length) {
    body = (
      <div className="saved-routes-list">
        {routes.map((route) => (
          <article className="saved-route-card" key={route.id}>
            <button type="button" onClick={() => onLoad(route)}>
              <span className="saved-route-icon"><Route /></span>
              <span className="saved-route-copy">
                <small>{savedRouteDate(route.updatedAt)}</small>
                <strong>{route.name}</strong>
                <span>{route.locationLabel} · {pluralStops(route.stops.length)}</span>
              </span>
              <ChevronRight />
            </button>
            <button className="saved-route-delete" type="button" onClick={() => onDelete(route.id)} disabled={deletingId === route.id} aria-label={`Elimina ${route.name}`}>
              {deletingId === route.id ? <LocateFixed className="spin" /> : <Trash2 />}
            </button>
          </article>
        ))}
      </div>
    );
  } else {
    body = <div className="saved-routes-empty"><Bookmark /><strong>Nessun percorso salvato</strong><span>Apri il riepilogo di un itinerario e tocca “Salva percorso”.</span></div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="saved-routes-sheet" side="bottom">
        <SheetHeader>
          <p className="sheet-kicker">La tua raccolta</p>
          <SheetTitle>Percorsi salvati</SheetTitle>
          <SheetDescription>Riapri un itinerario e ritrova le tappe sulla mappa.</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
