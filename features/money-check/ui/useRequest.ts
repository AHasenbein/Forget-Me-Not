import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_MS } from './model';

/**
 * Polls the active-request endpoint and KEEPS the last data while reloading (a card that blinks away is alarming).
 * `failed` is true while the last poll did not get through, so the caregiver dashboard never reads silence as "all clear".
 */
export function useRequest<T>(fetcher: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const once = async () => {
      try {
        const v = await fetchRef.current();
        if (live) {
          setData(v);
          setFailed(false);
        }
      } catch {
        if (live) setFailed(true); // keep the last good data
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

  return { data, failed, reload: useCallback(() => setTick((t) => t + 1), []) };
}
