import { z } from 'zod';

/** Press / acknowledge / resolve take no input; `.strict()` rejects a stray patientId or coordinates in the body. */
export const emptyInput = z.object({}).strict();

export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';

/** Deliberately no coordinates and no free text: only IDs, enums and timestamps. */
export interface Alert {
  id: string;
  patientId: string;
  createdAt: string;
  status: AlertStatus;
  /** Push attempts so far (including the first, inside the press). */
  attempts: number;
  lastAttemptAt: string | null;
  /** True once at least one caregiver push was delivered. */
  delivered: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

/** What the patient is told. Never contains a location. */
export type PatientStatus = 'notified' | 'no_one_reachable' | 'on_the_way';
