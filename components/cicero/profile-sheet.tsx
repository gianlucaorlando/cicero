'use client';

import type { User } from '@auth0/auth0-spa-js';
import { Check, LocateFixed, LogIn, LogOut, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { Auth0Status } from '@/hooks/use-auth0';
import { profileStatusLabels, type ProfileStatus } from '@/hooks/use-profile-sync';
import { preferenceCategories, type PreferenceCategory, type Profile } from '@/lib/profile';

export const preferenceCategoryLabels: Record<PreferenceCategory, string> = {
  cafe: 'Caffè',
  evening: 'Serata',
  museum: 'Musei',
  restaurant: 'Ristoranti',
  shopping: 'Shopping',
};

export type ManualPreferenceKey = 'avoidQueues' | 'markets' | 'noFish' | 'slowPace';

const manualPreferences: Array<{ key: ManualPreferenceKey; label: string; detail: string }> = [
  { key: 'slowPace', label: 'Ritmo tranquillo', detail: 'Meno tappe, più margine' },
  { key: 'avoidQueues', label: 'Evita le code', detail: 'Orari alternativi quando possibile' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authStatus: Auth0Status;
  user: User | null;
  displayName: string;
  initials: string;
  profile: Profile;
  editable: boolean;
  status: ProfileStatus;
  onLogin: () => void;
  onLogout: () => void;
  onToggle: (key: ManualPreferenceKey) => void;
  onForget: (category: PreferenceCategory, value: string) => void;
};

export function ProfileSheet({ open, onOpenChange, authStatus, user, displayName, initials, profile, editable, status, onLogin, onLogout, onToggle, onForget }: Props) {
  const learnedEntries = preferenceCategories.flatMap((category) => profile.learned[category].map((value) => ({ category, value })));
  const statusIcon = status === 'saved'
    ? <Check />
    : status === 'loading' || status === 'saving' ? <LocateFixed className="spin" /> : <X />;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="profile-sheet" side="right">
        <SheetHeader>
          <p className="sheet-kicker">Memoria</p>
          <SheetTitle>Le cose che Cicero sa di te</SheetTitle>
          <SheetDescription>Le salvi una volta. Vengono considerate in ogni nuovo viaggio.</SheetDescription>
        </SheetHeader>

        {authStatus === 'authenticated' ? (
          <section className="auth-card signed-in" aria-label="Profilo Auth0">
            <span className="auth-avatar">{initials || <UserRound />}</span>
            <span className="auth-copy">
              <strong>{displayName}</strong>
              <small>{user?.email || 'Profilo Auth0 collegato'}</small>
            </span>
            <Button type="button" variant="ghost" size="icon" aria-label="Esci dal profilo" onClick={onLogout}>
              <LogOut />
            </Button>
          </section>
        ) : authStatus !== 'unconfigured' && (
          <section className="auth-card" aria-label="Accesso al profilo">
            <span className="auth-avatar"><UserRound /></span>
            <span className="auth-copy">
              <strong>Porta le preferenze con te</strong>
              <small>Google, Facebook, TikTok oppure email e password</small>
            </span>
            <Button type="button" size="sm" disabled={authStatus === 'loading'} onClick={onLogin}>
              <LogIn /> Accedi
            </Button>
          </section>
        )}

        <div className="preference-list">
          {manualPreferences.map((preference) => (
            <div className={`preference-row ${editable ? '' : 'disabled'}`} key={preference.key}>
              <span id={`preference-${preference.key}`}><strong>{preference.label}</strong><small>{preference.detail}</small></span>
              <Switch checked={profile[preference.key]} disabled={!editable} onCheckedChange={() => onToggle(preference.key)} aria-labelledby={`preference-${preference.key}`} />
            </div>
          ))}
        </div>

        <section className="learned-memory" aria-labelledby="learned-memory-title">
          <div className="learned-memory-head">
            <strong id="learned-memory-title">Imparate conversando</strong>
            <small>Nascono dalle tue richieste</small>
          </div>
          {learnedEntries.length ? (
            <div className="memory-chips">
              {learnedEntries.map(({ category, value }) => (
                <button className="memory-chip" type="button" key={`${category}-${value}`} disabled={!editable} onClick={() => onForget(category, value)} aria-label={`Rimuovi ${value} da ${preferenceCategoryLabels[category]}`}>
                  <span><small>{preferenceCategoryLabels[category]}</small>{value}</span>
                  <X aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="memory-empty">Quando mi dirai cosa preferisci, lo troverai qui.</p>
          )}
        </section>

        <p className="storage-note">
          {statusIcon}
          {profileStatusLabels[status]}
        </p>
      </SheetContent>
    </Sheet>
  );
}
