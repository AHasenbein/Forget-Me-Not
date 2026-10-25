import { z } from 'zod';

/**
 * What the request is about. `described` = the patient typed it and no rule recognised it. The client NEVER sends this
 * (the server derives the kind from the typed note), only the three one-tap kinds are accepted from a client.
 */
export const KINDS = ['gift_card', 'bill', 'caller_wants_money', 'described'] as const;
export type Kind = (typeof KINDS)[number];
export const TAP_KINDS = ['gift_card', 'bill', 'caller_wants_money'] as const;

export const NOTE_MIN = 3;
export const NOTE_MAX = 200;
/** Either the patient types what the payment is for, or (API only) picks a one-tap kind. */
export const createInput = z.union([
  z.object({ note: z.string().trim().min(NOTE_MIN).max(NOTE_MAX) }).strict(),
  z.object({ kind: z.enum(TAP_KINDS) }).strict(),
]);
export const decideInput = z.object({ decision: z.enum(['approve', 'decline']) }).strict();

export type Level = 'stop' | 'check' | 'ok';
export const REASONS = [
  'gift_card_payment',
  'caller_pressure',
  'no_matching_bill',
  'large_amount',
  'known_bill',
  'looks_like_scam',
  'unclear_purpose',
  'ai_unsure',
  'everyday_purchase',
] as const;
export type Reason = (typeof REASONS)[number];

/** `cleared` = auto-cleared as an ordinary everyday payment (rules AND the AI agreed); no caregiver decision. */
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cleared';

/**
 * No payee or amount: a bill is referenced by id and looked up when the caregiver views it. The one piece of free text is
 * the patient's own `note` (trimmed, capped, digit runs redacted): shown ONLY to the caregiver, never in a push, an event,
 * the audit log, a log line or any patient response.
 */
export interface MoneyRequest {
  id: string;
  patientId: string;
  kind: Kind;
  level: Level;
  reasons: Reason[];
  billId: string | null;
  note: string | null;
  /** True when a model gave a usable second opinion on the note. Shown to the caregiver so nobody assumes an AI looked when it did not. */
  aiChecked: boolean;
  createdAt: string;
  expiresAt: string;
  status: RequestStatus;
  /** True once at least one caregiver push was delivered. */
  delivered: boolean;
  /** Caregiver id, or null when the request expired (fail closed => declined). */
  decidedBy: string | null;
  decidedAt: string | null;
}

/** What the patient is told. */
export type PatientStatus = 'waiting' | 'no_one_reachable' | 'ok_to_go' | 'looks_ok' | 'dont_pay';

export interface AuditEntry {
  at: string;
  requestId: string;
  action: 'created' | 'approved' | 'declined' | 'expired' | 'auto_cleared';
  by: string | null;
}
