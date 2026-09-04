'use client';

import type { SubmitEvent } from 'react';
import { LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cityInput: string;
  onCityInputChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  locating: boolean;
  onUseCurrentLocation: () => void;
};

export function LocationSheet({ open, onOpenChange, cityInput, onCityInputChange, onSubmit, locating, onUseCurrentLocation }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="location-sheet" side="bottom">
        <SheetHeader>
          <p className="sheet-kicker">Dove andiamo?</p>
          <SheetTitle>Cambia città</SheetTitle>
          <SheetDescription>La mappa cambia; le tue preferenze restano.</SheetDescription>
        </SheetHeader>
        <form className="city-form" onSubmit={onSubmit}>
          <Input value={cityInput} onChange={(event) => onCityInputChange(event.target.value)} placeholder="Es. Lisbona, Portogallo" aria-label="Città" />
          <Button type="submit" disabled={locating}>{locating ? 'Cerco…' : 'Vai'}</Button>
        </form>
        <button className="gps-row" type="button" onClick={onUseCurrentLocation}><LocateFixed /> Usa la mia posizione</button>
      </SheetContent>
    </Sheet>
  );
}
