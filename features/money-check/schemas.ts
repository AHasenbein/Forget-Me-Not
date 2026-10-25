import { z } from 'zod';

/** What the patient says is happening. Big buttons on the screen, so no free text anywhere. */
export const KINDS = ['gift_card', 'bill', 'caller_wants_money'] as const;
export type Kind = (typeof KINDS)[number];

export const createInput = z.object({ kind: z.enum(KINDS) }).strict();
export const decideInput = z.object({ decision: z.enum(['approve', 'decline']) }).strict();

export type Level = 'stop' | 'check' | 'ok';
export const REASONS = [
  'gift_card_payment',
  'caller_pressure',
  'no_matching_bill',
  'large_amount',
  'known_bill',
] as const;
export type Reason = (typeof REASONS)[number];

export type RequestStatus = 'pending' | 'approved' | 'declined';

/** Deliberately no payee, amount or free text: a bill is referenced by id and looked up when the caregiver views it. */
export interface MoneyRequest {
  id: string;
  patientId: string;
  kind: Kind;
  level: Level;
  reasons: Reason[];
  billId: string | null;
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
export type PatientStatus = 'waiting' | 'no_one_reachable' | 'ok_to_go' | 'dont_pay';

export interface AuditEntry {
  at: string;
  requestId: string;
  action: 'created' | 'approved' | 'declined' | 'expired';
  by: string | null;
}
