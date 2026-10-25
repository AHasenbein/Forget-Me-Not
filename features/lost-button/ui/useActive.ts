import { useCallback, useEffect, useRef, useState } from 'react';
import { alertPollMs } from './model';

/**
 * Polls the active-alert endpoint. Unlike the shared `usePoll` it KEEPS the last data while reloading (a card that
 * blinks away on every refresh is alarming), and it slows down while an alert is open, because each caregiver call
 * with an open alert reads and audit-logs the location.
 */
export function useActive<T extends { alert: unknown }>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const openRef = useRef(false);
  const run = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const once = async () => {
      try {
        const v = await fetchRef.current();
        if (!live) return;
        openRef.current = !!v.alert;
        setData(v);
        setFailed(false);
      } catch {
        if (live) setFailed(true); // keep the last good data
      }
    };
    const loop = async () => {
      await once();
      if (live) timer = setTimeout(() => void loop(), alertPollMs(openRef.current));
    };
    run.current = async () => {
      clearTimeout(timer);
      await loop();
    };
    setData(null);
    openRef.current = false;
    void loop();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, deps);

  const reload = useCallback(() => run.current(), []);
  return { data, failed, reload };
}
