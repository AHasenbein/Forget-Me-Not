/** How often the patient's device reports its position. Best-effort: the OS may delay or suspend it. */
export const REPORT_INTERVAL_MS = 5 * 60_000;

/** A reading older than this is "stale": shown as "last seen", never as "now". */
export const STALE_AFTER_MS = 3 * REPORT_INTERVAL_MS;

/** Tolerated device clock skew; readings dated further in the future are rejected. */
export const MAX_FUTURE_SKEW_MS = 60_000;

/** Largest offline-queue flush accepted in one request. */
export const MAX_BATCH = 50;

/** A "Find them" session: precise live updates for a short, visible window, then back to the 5-minute cadence. */
export const FIND_SESSION_MS = 10 * 60_000;

/** During a find session the patient device reports about this often (in-memory only, never queued offline). */
export const FIND_REPORT_INTERVAL_MS = 3_000;
