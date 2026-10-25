import { createContext, useContext, useEffect } from 'react';
import type { Attention } from '../feature-registry/ui';
import type { AttentionReport } from './widget-groups';

/** Set by the caregiver dashboard around each widget. Outside it (patient screens) reports go nowhere. */
export const AttentionContext = createContext<((r: AttentionReport) => void) | null>(null);

/**
 * Tell the dashboard's status line what this widget needs. Pass `null` until the first load finishes ("checking").
 * Call it on every render, before any early return; it only reports when the value changes.
 */
export function useAttention(a: Attention | null) {
  const report = useContext(AttentionContext);
  const key = a ? JSON.stringify(a) : 'checking';
  useEffect(() => {
    report?.(a ?? 'checking');
  }, [report, key]); // `key` stands in for `a` (a fresh object every render)
}
