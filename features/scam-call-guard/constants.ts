const MIN = 60_000;

/** New transcript characters needed before the AI is asked again (rules run on every segment; the AI is the slow, costly part). */
export const ANALYZE_EVERY_CHARS = 400;
/** The AI must answer inside this window or the segment response goes out on the rules alone. */
export const AI_TIMEOUT_MS = 4_000;
/** Rolling transcript window kept IN MEMORY while a call is active; dropped when the call ends. */
export const WINDOW_CHARS = 6_000;
export const MAX_SEGMENT_CHARS = 2_000;
export const MAX_CALL_CHARS = 200_000;
/** A call with no segment for this long is closed by the sweep (dead battery, phone hung up, app killed). */
export const IDLE_END_MS = 10 * MIN;
export const MAX_CALL_MS = 3 * 60 * MIN;
/** Failed caregiver pushes are retried by the sweep this often, at most this many times per call. */
export const PUSH_RETRY_MS = 2 * MIN;
export const MAX_PUSH_ATTEMPTS = 5;
/** AI confidence at/above which an AI "scam" verdict alone raises the warning to `danger`. */
export const AI_DANGER_CONFIDENCE = 0.9;
export const SUMMARY_MAX_CHARS = 600;
