'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { PlaceReviews } from '@/lib/types';

type State = { key: string | null; status: 'ready' | 'error'; data: PlaceReviews | null };

/**
 * Reviews for the place whose sheet is open, loaded when it opens. A state
 * that belongs to another place (or to a retry) reads as loading, so a sheet
 * never shows the reviews of the place opened before.
 */
export function usePlaceReviews(placeId: string | null) {
  const [state, setState] = useState<State>({ key: null, status: 'ready', data: null });
  const [attempt, setAttempt] = useState(0);
  const key = placeId ? `${placeId}#${attempt}` : null;

  useEffect(() => {
    if (!placeId || !key) return;
    const controller = new AbortController();
    api.reviews(placeId, controller.signal)
      .then((data) => setState({ key, status: 'ready', data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [key, placeId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state.key === key ? state : { status: 'loading' as const, data: null };
  return { status: current.status, data: current.data, retry };
}
