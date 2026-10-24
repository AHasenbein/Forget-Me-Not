/**
 * AI client wrapper port. All model output is UNTRUSTED: it may inform the UI but must never
 * trigger an action. Low confidence => flag for caregiver review.
 */
export interface AiResult {
  text: string;
  /** 0..1. Below LOW_CONFIDENCE the caller must flag for caregiver review. */
  confidence: number;
}
export const LOW_CONFIDENCE = 0.7;

export interface AiClient {
  complete(input: { task: string; content: string }): Promise<AiResult>;
}
