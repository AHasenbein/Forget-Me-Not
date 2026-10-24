import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Polls `fn` every `ms`. Keeps the last good data when a poll fails (so a dropped connection does not blank
 * the screen) and exposes the error. `deps` restart it (e.g. when the persona changes).
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (alive: () => boolean) => {
    try {
      const v = await fnRef.current();
      if (alive()) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (alive()) setError(e instanceof ApiError ? e : new ApiError(0, 'offline'));
    } finally {
      if (alive()) setLoading(false);
    }
  }, []);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const alive = () => live;
    setLoading(true);
    setData(null);
    void run(alive);
    const id = setInterval(() => void run(alive), ms);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [ms, run, tick, ...deps]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
