import { z } from 'zod';
import { MAX_SEGMENT_CHARS } from './constants';

/** Explicit per-call start. `consent` must be literally true: starting a call session IS the consent tap. */
export const startInput = z.object({ consent: z.literal(true) }).strict();
export const segmentInput = z
  .object({
    /** Client-side counter. Retries re-send the same seq and are ignored, so nothing is analysed twice. */
    seq: z.number().int().min(0).max(1_000_000),
    text: z.string().trim().min(1).max(MAX_SEGMENT_CHARS),
  })
  .strict();
export const emptyInput = z.object({}).strict();
export const reviewInput = z
  .object({ outcome: z.enum(['confirmed_scam', 'false_alarm']) })
  .strict();

export type Signal =
  | 'gift_card'
  | 'wire_transfer'
  | 'crypto'
  | 'read_numbers'
  | 'personal_info'
  | 'social_security'
  | 'verify_details'
  | 'authority'
  | 'threat'
  | 'rate_offer'
  | 'prize_win'
  | 'advance_fee'
  | 'safe_account'
  | 'fake_charge'
  | 'keep_on_line'
  | 'say_yes'
  | 'grandchild_in_trouble'
  | 'remote_access'
  | 'secrecy'
  | 'urgency';

export type Warning = 'none' | 'caution' | 'danger';
export type AiVerdict = 'scam' | 'not_scam' | 'unclear' | 'unparsed';
export type Review = 'confirmed_scam' | 'false_alarm';

/**
 * One phone call. Deliberately holds NO transcript, caller number or name: only enums, ids, timestamps and the
 * (untrusted, length-capped) AI overview the caregiver reads.
 */
export interface Call {
  id: string;
  patientId: string;
  startedAt: string;
  lastSegmentAt: string;
  endedAt: string | null;
  status: 'active' | 'ended';
  lastSeq: number;
  totalChars: number;
  charsSinceAnalysis: number;
  signals: Signal[];
  level: Warning;
  aiVerdict: AiVerdict | null;
  aiConfidence: number | null;
  /** AI-generated, may be wrong or manipulated by the caller. Never shown to the patient. */
  summary: string | null;
  /** AI unavailable / unparsable / low confidence: a human should look. */
  needsReview: boolean;
  /** Highest tier the caregiver event was emitted for / a push was delivered for. */
  alertedLevel: Warning;
  notifiedLevel: Warning;
  pushAttempts: number;
  lastPushAt: string | null;
  review: Review | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ViewEntry {
  callId: string;
  patientId: string;
  viewerId: string;
  at: string;
}
