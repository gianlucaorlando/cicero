'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Auth0Status } from '@/hooks/use-auth0';
import { api, ApiError, type AuthHeaders } from '@/lib/api';
import { createEmptyProfile, normalizeProfile, type Profile } from '@/lib/profile';
import type { ProfilePatch } from '@/lib/types';

const LEGACY_STORAGE_KEY = 'cicero-profile-v2';
const SAVE_DEBOUNCE_MS = 350;

export type ProfileStatus = 'error' | 'loading' | 'saved' | 'saving' | 'signed-out' | 'unconfigured';

export const profileStatusLabels: Record<ProfileStatus, string> = {
  saved: 'Sincronizzato con il tuo profilo',
  saving: 'Salvataggio sul profilo…',
  loading: 'Carico il tuo profilo…',
  'signed-out': 'Accedi per sincronizzare le preferenze',
  unconfigured: 'Auth0 deve ancora essere collegato',
  error: 'Preferenze non sincronizzate',
};

export function applyProfilePatch(current: Profile, patch: ProfilePatch): Profile {
  const learned = { ...current.learned };
  for (const { category, value } of patch.forget || []) {
    learned[category] = learned[category].filter((item) => item.toLocaleLowerCase('it') !== value.toLocaleLowerCase('it'));
  }
  for (const { category, value } of patch.learn || []) {
    const rest = learned[category].filter((item) => item.toLocaleLowerCase('it') !== value.toLocaleLowerCase('it'));
    learned[category] = [value, ...rest].slice(0, 4);
  }
  return normalizeProfile({
    slowPace: patch.slowPace ?? current.slowPace,
    avoidQueues: patch.avoidQueues ?? current.avoidQueues,
    noFish: patch.noFish ?? current.noFish,
    markets: patch.markets ?? current.markets,
    learned,
  });
}

type Params = {
  authStatus: Auth0Status;
  getAccessToken: () => Promise<string | null>;
};

/** Sync state tagged with the auth status it belongs to, so a sign-in change invalidates it. */
type SyncState = { auth: Auth0Status; status: Exclude<ProfileStatus, 'loading' | 'unconfigured'> };

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Loads the profile for the signed-in user and persists every change with a
 * short debounce. Falls back to the OpenAI Sites identity when Auth0 is absent.
 */
export function useProfileSync({ authStatus, getAccessToken }: Params) {
  const [profile, setProfile] = useState<Profile>(() => createEmptyProfile());
  const [sync, setSync] = useState<SyncState | null>(null);
  const lastPersisted = useRef<string | null>(null);
  const syncEnabled = useRef(false);

  const current = sync?.auth === authStatus ? sync : null;
  const needsServer = authStatus === 'authenticated' || authStatus === 'unconfigured';

  const status: ProfileStatus = authStatus === 'loading'
    ? 'loading'
    : authStatus === 'error'
      ? 'error'
      : authStatus === 'anonymous'
        ? 'signed-out'
        : current?.status ?? 'loading';
  const ready = needsServer ? current !== null : authStatus !== 'loading';

  const authHeaders = useCallback(async (): Promise<AuthHeaders | null> => {
    const token = authStatus === 'authenticated' ? await getAccessToken() : null;
    if (authStatus === 'authenticated' && !token) return null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [authStatus, getAccessToken]);

  useEffect(() => {
    let active = true;
    syncEnabled.current = false;
    lastPersisted.current = null;
    if (!needsServer) return () => { active = false; };

    async function load() {
      try {
        const headers = await authHeaders();
        if (!headers) {
          if (active) setSync({ auth: authStatus, status: 'signed-out' });
          return;
        }
        const data = await api.profile.get(headers);
        let next = normalizeProfile(data.profile);

        const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!data.exists && legacy) {
          try {
            next = normalizeProfile(JSON.parse(legacy));
          } catch { /* an invalid legacy profile is ignored */ }
        }

        if (!active) return;
        syncEnabled.current = true;
        lastPersisted.current = data.exists ? JSON.stringify(next) : null;
        setProfile(next);
        setSync({ auth: authStatus, status: data.exists ? 'saved' : 'saving' });
        if (data.exists) window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        if (active) setSync({ auth: authStatus, status: isUnauthorized(error) ? 'signed-out' : 'error' });
      }
    }

    void load();
    return () => { active = false; };
  }, [authHeaders, authStatus, needsServer]);

  useEffect(() => {
    if (!ready || !syncEnabled.current) return;
    const serialized = JSON.stringify(profile);
    if (serialized === lastPersisted.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSync({ auth: authStatus, status: 'saving' });
      try {
        const headers = await authHeaders();
        if (!headers) {
          syncEnabled.current = false;
          setSync({ auth: authStatus, status: 'signed-out' });
          return;
        }
        const data = await api.profile.put(profile, headers, controller.signal);
        lastPersisted.current = JSON.stringify(normalizeProfile(data.profile));
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        setSync({ auth: authStatus, status: 'saved' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (isUnauthorized(error)) syncEnabled.current = false;
        setSync({ auth: authStatus, status: isUnauthorized(error) ? 'signed-out' : 'error' });
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authHeaders, authStatus, profile, ready]);

  const applyPatch = useCallback((patch: ProfilePatch) => {
    setProfile((value) => applyProfilePatch(value, patch));
  }, []);

  const editable = ready && needsServer && status !== 'signed-out';

  return { profile, setProfile, applyPatch, ready, status, editable };
}
