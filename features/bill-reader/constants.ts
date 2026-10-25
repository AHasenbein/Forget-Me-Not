/** A readable photo of a bill is much bigger than a pill-check frame. */
export const MAX_IMAGES = 2;
export const MAX_IMAGE_B64 = 2_400_000; // ~1.8 MB of image per picture
export const MAX_BODY_BYTES = 5_000_000;

/** Below this the picture counts as "could not read it": the patient is never shown a guess. */
export const MIN_CONFIDENCE = 0.7;

/** How many scans are kept per patient (latest first). No picture is ever stored. */
export const KEEP_SCANS = 10;
/** Caps a confused patient (or a scammer on their phone) from hammering the model. */
export const MAX_SCANS_PER_DAY = 30;
export const DAY_MS = 24 * 60 * 60_000;
/** The model has this long to answer; after that the patient is told it could not be read. */
export const READ_TIMEOUT_MS = 30_000;
