'use client';

import { createAuth0Client, type Auth0Client, type User } from '@auth0/auth0-spa-js';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Auth0Status = 'anonymous' | 'authenticated' | 'error' | 'loading' | 'unconfigured';

type Auth0PublicConfig = {
  domain: string;
  clientId: string;
  audience: string;
};

export function useAuth0() {
  const client = useRef<Auth0Client | null>(null);
  const [status, setStatus] = useState<Auth0Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const response = await fetch('/api/auth/config', { cache: 'no-store' });
        if (response.status === 503) {
          if (active) setStatus('unconfigured');
          return;
        }
        if (!response.ok) throw new Error('Auth0 config unavailable');

        const config = await response.json() as Auth0PublicConfig;
        const auth0 = await createAuth0Client({
          domain: config.domain,
          clientId: config.clientId,
          cacheLocation: 'localstorage',
          useRefreshTokens: true,
          useRefreshTokensFallback: true,
          authorizationParams: {
            audience: config.audience,
            redirect_uri: window.location.origin,
            scope: 'openid profile email',
          },
        });

        if (!active) return;
        client.current = auth0;

        const url = new URL(window.location.href);
        if (url.searchParams.has('code') && url.searchParams.has('state')) {
          await auth0.handleRedirectCallback();
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        }

        const authenticated = await auth0.isAuthenticated();
        if (!active) return;
        setUser(authenticated ? await auth0.getUser() || null : null);
        setStatus(authenticated ? 'authenticated' : 'anonymous');
      } catch {
        if (active) setStatus('error');
      }
    }

    void initialize();
    return () => { active = false; };
  }, []);

  const login = useCallback(async () => {
    setStatus('loading');
    try {
      await client.current?.loginWithRedirect({
        appState: { returnTo: `${window.location.pathname}${window.location.search}` },
      });
    } catch {
      setStatus('error');
    }
  }, []);

  const logout = useCallback(async () => {
    await client.current?.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!client.current || status !== 'authenticated') return null;
    try {
      return await client.current.getTokenSilently();
    } catch {
      setUser(null);
      setStatus('anonymous');
      return null;
    }
  }, [status]);

  return { status, user, login, logout, getAccessToken };
}
