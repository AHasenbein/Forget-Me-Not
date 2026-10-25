import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_MS } from './model';

/** Polls the active-request endpoint and KEEPS the last data while reloading (a card that blinks away is alarming). */
export function useRequest<T>(fetcher: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const once = async () => {
      try {
        const v = await fetchRef.current();
        if (live) setData(v);
      } catch {
        // keep the last good data
      }
    };
    setData(null);
    void once();
    const id = setInterval(() => void once(), POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [tick, ...deps]);

  return { data, reload: useCallback(() => setTick((t) => t + 1), []) };
}
