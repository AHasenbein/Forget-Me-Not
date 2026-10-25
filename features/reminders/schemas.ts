import { z } from 'zod';
import { FRAME_TYPES, type FrameType } from '@core/ai/vision';
import { isValidTimeZone } from './time';

export const REMINDER_KINDS = ['pill', 'brush_teeth', 'shower', 'feed_pets', 'custom'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const kind = z.enum(REMINDER_KINDS);

export const LABEL_MAX = 40;
/**
 * The caregiver's own words for a `custom` reminder ("Water the plants"). The ONE free-text field here: shown on the
 * patient's and caregiver's screens only, never in a push, an event, the audit log or a log line. Plain words only:
 * no links, no markup, digit runs of 6+ masked (phone / account numbers do not belong in a reminder).
 */
const label = z
  .string()
  .trim()
  .min(2)
  .max(LABEL_MAX)
  .refine((t) => !/[<>{}]|https?:|www\.|@/i.test(t), 'plain words only')
  .transform((t) => t.replace(/\s+/g, ' ').replace(/\d{6,}/g, '[number]'));
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const days = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .transform((d) => [...new Set(d)].sort());
const timeZone = z.string().refine(isValidTimeZone, 'unknown time zone');

/** Only fields the caller may set. `label` is required for `custom` reminders and refused for every other kind. */
export const createScheduleInput = z
  .object({
    kind,
    label: label.optional(),
    localTime,
    daysOfWeek: days.default([0, 1, 2, 3, 4, 5, 6]),
    timeZone,
    escalate: z.boolean().default(true),
  })
  .strict()
  .refine((v) => (v.kind === 'custom') === (v.label !== undefined), {
    message: 'a custom reminder needs a label; other kinds take none',
    path: ['label'],
  });

export const patchScheduleInput = z
  .object({
    localTime: localTime.optional(),
    daysOfWeek: days.optional(),
    timeZone: timeZone.optional(),
    escalate: z.boolean().optional(),
    paused: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'nothing to change');

/** POST bodies may be empty: `{}` is the default, so a bare POST is valid. */
export const emptyInput = z.object({}).strict().default({});

/** Photos for the pill check: at most 5, each a real JPEG/PNG/WebP (the bytes are re-checked server-side). */
export const pillCheckInput = z
  .object({
    frames: z
      .array(
        z
          .object({
            mediaType: z.enum(FRAME_TYPES),
            data: z
              .string()
              .min(16)
              .max(700_000)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export const reviewInput = z.object({ decision: z.enum(['approve', 'reject']) }).strict();

export type CreateScheduleInput = z.infer<typeof createScheduleInput>;
export type PatchScheduleInput = z.infer<typeof patchScheduleInput>;

export interface Schedule {
  id: string;
  patientId: string;
  kind: ReminderKind;
  /** Only for `custom`: the caregiver's words. Never pushed, emitted or logged. */
  label?: string;
  localTime: string;
  daysOfWeek: number[];
  timeZone: string;
  escalate: boolean;
  paused: boolean;
  createdBy: string;
  /** Occurrences due before this are never generated (no spurious "missed" for a just-created schedule). */
  activeFrom: string;
}

export type OccurrenceStatus = 'pending' | 'confirmed' | 'missed' | 'skipped';

export interface Confirmation {
  at: string;
  by: string;
  /** 'video' arrives with the pill-vision step; 'caregiver' = confirmed on the patient's behalf. */
  method: 'tap' | 'video' | 'caregiver';
  /** Tap confirmations stay 'unverified'; the video step will move pills to pending_review/verified/rejected. */
  verification: Verification;
  /** Set when a caregiver reviewed the photos. */
  reviewedBy?: string;
  reviewedAt?: string;
}
export type Verification = 'unverified' | 'pending_review' | 'verified' | 'rejected';

/** Photos kept ONLY while a human needs to review them (never when the check passed). */
export interface Frame {
  id: string;
  occurrenceId: string;
  patientId: string;
  mediaType: FrameType;
  data: string; // base64
  createdAt: string;
}

/** Who looked at sensitive things (photos) and who reviewed. Visible to the caregiver. */
export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  patientId: string;
  action: 'pill_frames_viewed' | 'pill_check_reviewed';
  occurrenceId: string;
}

export interface Occurrence {
  /** `${scheduleId}:${localDate}`: one per schedule per local day (DST cannot create two). */
  id: string;
  scheduleId: string;
  patientId: string;
  kind: ReminderKind;
  /** Copied from the schedule (`custom` only). */
  label?: string;
  localDate: string;
  timeZone: string;
  dueAt: string;
  status: OccurrenceStatus;
  snoozeCount: number;
  snoozedUntil: string | null;
  nudges: number;
  missedAt: string | null;
  confirmation: Confirmation | null;
}
