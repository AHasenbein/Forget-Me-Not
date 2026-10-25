const MIN = 60_000;

/** An undecided request is declined after this: no answer means "do not pay", never "go ahead". */
export const REQUEST_TTL_MS = 30 * MIN;
/** Caps a patient (or a scammer on their phone) from filling the caregiver's screen with requests. */
export const MAX_REQUESTS_PER_DAY = 6;
export const DAY_MS = 24 * 60 * MIN;
/** How long the patient keeps seeing the last answer after it is given, so they are never left guessing. */
export const OUTCOME_MS = 10 * MIN;

/** A model that has not answered by now is ignored: the rules verdict stands (the patient is waiting). */
export const AI_TIMEOUT_MS = 8_000;
