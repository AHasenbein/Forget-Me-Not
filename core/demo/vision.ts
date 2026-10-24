import type { VisionClient, VisionResult } from '../ai/vision';

/** Demo control: what the canned pill check will "see" (settings > Demo controls). Sticky until changed. */
export const VISION_OUTCOMES = ['clear', 'unclear', 'not_taken'] as const;
export type VisionOutcome = (typeof VISION_OUTCOMES)[number];

let outcome: VisionOutcome = 'clear';
export const getVisionOutcome = () => outcome;
export const setVisionOutcome = (o: VisionOutcome) => void (outcome = o);

const RESULTS: Record<VisionOutcome, VisionResult> = {
  clear: { verdict: 'taken', confidence: 0.95 },
  unclear: { verdict: 'unclear', confidence: 0.4 },
  not_taken: { verdict: 'not_taken', confidence: 0.9 },
};

export const createDemoVision = (): VisionClient => ({
  assessPillTaken: async () => RESULTS[outcome],
});
