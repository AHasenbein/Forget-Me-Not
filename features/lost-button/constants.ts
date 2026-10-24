const MIN = 60_000;

/** Repeat cadence while nobody has acknowledged: quick at first, then calmer so a long search is not a push storm. */
export const FAST_REPEAT_MS = 2 * MIN;
export const SLOW_REPEAT_MS = 10 * MIN;
export const FAST_PUSHES = 5; // attempts (including the first) sent at the fast cadence

/** An alert nobody acknowledged or resolved is closed after this; a new press starts a fresh one. */
export const ALERT_TTL_MS = 24 * 60 * MIN;

/** Delay before the next attempt, given how many attempts have been made. */
export const repeatDelayMs = (attempts: number) =>
  attempts < FAST_PUSHES ? FAST_REPEAT_MS : SLOW_REPEAT_MS;
