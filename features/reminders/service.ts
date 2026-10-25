import { LOW_CONFIDENCE } from '@core/ai/client';
import { sniffFrameType, type VisionClient, type VisionFrame } from '@core/ai/vision';
import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { logger } from '@core/logging/logger';
import { HttpError } from '@core/server/errors';
import type {
  CreateScheduleInput,
  Frame,
  Occurrence,
  PatchScheduleInput,
  ReminderKind,
  Schedule,
  Verification,
} from './schemas';
import type { ReminderStore } from './store';
import { localDateOf, localTimeToUtc, weekdayOf } from './time';

/** Timeline per occurrence (minutes after due): prompt at 0, again at +15, caregiver alert at +30. */
export const PROMPT_AGAIN_MIN = 15;
export const ESCALATE_MIN = 30;
export const SNOOZE_MIN = 10;
export const MAX_SNOOZES = 2;
export const EARLY_WINDOW_MIN = 60;
/** Two pills can never be confirmed closer than this (double-dose guard; covers travel/DST/edits). */
export const PILL_MIN_GAP_MIN = 120;
export const MAX_SCHEDULES = 20;
/** Photos are kept only for review, and never longer than this. */
export const FRAME_RETENTION_DAYS = 7;

const MIN = 60_000;
const PLAIN: Record<ReminderKind, string> = {
  pill: 'Time to take your pill',
  brush_teeth: 'Time to brush your teeth',
  shower: 'Time for your shower',
  feed_pets: 'Time to feed your pets',
  custom: 'Time for your reminder', // never the caregiver's label: push text leaves our servers
};

export interface ReminderDeps {
  store: ReminderStore;
  bus: EventBus;
  notifier: () => Notifier; // lazy: only sweeps need it
  vision: () => VisionClient; // lazy: only the pill check needs it
  now: () => Date;
}

export type Phase = 'upcoming' | 'due' | 'snoozed' | 'overdue' | 'confirmed' | 'missed' | 'skipped';

const iso = (ms: number) => new Date(ms).toISOString();
const dueMs = (o: Occurrence) => Date.parse(o.dueAt);
const escalateMs = (o: Occurrence) => dueMs(o) + (ESCALATE_MIN + o.snoozeCount * SNOOZE_MIN) * MIN;
const effectiveMs = (o: Occurrence) =>
  Math.max(dueMs(o), o.snoozedUntil ? Date.parse(o.snoozedUntil) : 0);

export function createReminderService({ store, bus, notifier, vision, now }: ReminderDeps) {
  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };
  /** 404 (never 403) for another patient's data: don't confirm that the id exists. */
  const ownOccurrence = async (user: AuthUser, id: string) => {
    const o = await store.getOccurrence(id);
    if (!o || o.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return o;
  };
  const ownSchedule = async (user: AuthUser, id: string) => {
    const s = await store.getSchedule(id);
    if (!s || s.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return s;
  };

  /**
   * Known limit: this check reads and the confirm that follows writes, so two simultaneous confirms of two
   * DIFFERENT pill occurrences could both pass. Closing it needs a database-side guard (Postgres function).
   */
  const recentPillConfirmation = async (patientId: string, exceptId: string, at: number) =>
    (await store.listOccurrences(patientId)).some(
      (o) =>
        o.id !== exceptId &&
        o.kind === 'pill' &&
        o.confirmation &&
        Math.abs(at - Date.parse(o.confirmation.at)) < PILL_MIN_GAP_MIN * MIN,
    );

  function phaseOf(o: Occurrence, at: number): Phase {
    if (o.status !== 'pending') return o.status;
    if (at >= escalateMs(o)) return 'overdue';
    if (o.snoozedUntil && at < Date.parse(o.snoozedUntil)) return 'snoozed';
    return at >= dueMs(o) ? 'due' : 'upcoming';
  }
  const view = (o: Occurrence, at: number) => ({ ...o, phase: phaseOf(o, at) });

  /** Creates today's (local) occurrence for each active schedule. Idempotent. */
  async function ensureToday(schedules: Schedule[], at: Date) {
    for (const s of schedules) {
      if (s.paused) continue;
      const localDate = localDateOf(at, s.timeZone);
      if (!s.daysOfWeek.includes(weekdayOf(localDate))) continue;
      const id = `${s.id}:${localDate}`;
      const due = localTimeToUtc(localDate, s.localTime, s.timeZone);
      if (due.getTime() < Date.parse(s.activeFrom)) continue;
      await store.insertOccurrenceIfAbsent({
        id,
        scheduleId: s.id,
        patientId: s.patientId,
        kind: s.kind,
        ...(s.label ? { label: s.label } : {}),
        localDate,
        timeZone: s.timeZone,
        dueAt: due.toISOString(),
        status: 'pending',
        snoozeCount: 0,
        snoozedUntil: null,
        nudges: 0,
        missedAt: null,
        confirmation: null,
      });
    }
  }

  return {
    // ---- caregiver: manage schedules -------------------------------------------------------
    async createSchedule(user: AuthUser, input: CreateScheduleInput): Promise<Schedule> {
      requireRole(user, 'primary_caregiver');
      const patientId = patientOf(user);
      if ((await store.listSchedules(patientId)).length >= MAX_SCHEDULES)
        throw new HttpError(409, 'too_many');
      const s: Schedule = {
        id: crypto.randomUUID(),
        patientId,
        ...input,
        paused: false,
        createdBy: user.id,
        activeFrom: now().toISOString(),
      };
      await store.putSchedule(s);
      return s;
    },

    async updateSchedule(user: AuthUser, id: string, patch: PatchScheduleInput): Promise<Schedule> {
      requireRole(user, 'primary_caregiver');
      const s = { ...(await ownSchedule(user, id)), ...patch };
      if (patch.localTime || patch.timeZone || patch.daysOfWeek) {
        s.activeFrom = now().toISOString();
        // Today's not-yet-actioned occurrence is regenerated from the new time.
        for (const o of await store.listOccurrences(s.patientId))
          if (o.scheduleId === s.id && o.status === 'pending' && o.nudges === 0)
            await store.deleteOccurrence(o.id);
      }
      await store.putSchedule(s);
      return s;
    },

    async deleteSchedule(user: AuthUser, id: string): Promise<void> {
      requireRole(user, 'primary_caregiver');
      const s = await ownSchedule(user, id);
      for (const o of await store.listOccurrences(s.patientId))
        if (o.scheduleId === s.id && o.status === 'pending') await store.deleteOccurrence(o.id);
      await store.deleteSchedule(s.id);
    },

    async listSchedules(user: AuthUser): Promise<Schedule[]> {
      requireRole(user, 'patient', 'primary_caregiver');
      return store.listSchedules(patientOf(user));
    },

    // ---- patient + caregiver ---------------------------------------------------------------
    async today(user: AuthUser) {
      requireRole(user, 'patient', 'primary_caregiver');
      const patientId = patientOf(user);
      const at = now();
      await ensureToday(await store.listSchedules(patientId), at);
      return (await store.listOccurrences(patientId))
        .filter((o) => o.localDate === localDateOf(at, o.timeZone))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map((o) => view(o, at.getTime()));
    },

    /** Last `days` days (default 7, max 30) with a summary, for the caregiver. */
    async history(user: AuthUser, days: number) {
      requireRole(user, 'patient', 'primary_caregiver');
      const n = Number.isInteger(days) ? Math.min(30, Math.max(1, days)) : 7;
      const at = now().getTime();
      const items = (await store.listOccurrences(patientOf(user)))
        .filter((o) => dueMs(o) >= at - n * 86_400_000 && dueMs(o) <= at)
        .sort((a, b) => b.dueAt.localeCompare(a.dueAt))
        .map((o) => view(o, at));
      const count = (p: Phase) => items.filter((o) => o.phase === p).length;
      return {
        days: n,
        summary: {
          confirmed: count('confirmed'),
          missed: count('missed') + count('overdue'),
          skipped: count('skipped'),
        },
        occurrences: items,
      };
    },

    /** One tap. Idempotent: a second tap returns the existing confirmation. */
    async confirm(user: AuthUser, id: string) {
      requireRole(user, 'patient', 'primary_caregiver');
      const o = await ownOccurrence(user, id);
      const at = now().getTime();
      if (o.status === 'confirmed') return { occurrence: view(o, at), alreadyConfirmed: true };
      if (o.status === 'skipped') throw new HttpError(409, 'skipped');
      const caregiver = user.role === 'primary_caregiver';
      if (o.status === 'missed' && o.kind === 'pill' && !caregiver)
        throw new HttpError(409, 'expired_ask_caregiver'); // the caregiver may already have given it
      if (!caregiver && at < dueMs(o) - EARLY_WINDOW_MIN * MIN)
        throw new HttpError(409, 'too_early');
      if (o.kind === 'pill' && (await recentPillConfirmation(o.patientId, o.id, at)))
        throw new HttpError(409, 'too_soon');
      const updated = await store.updateOccurrenceIf(
        o.id,
        { status: ['pending', 'missed'] },
        {
          status: 'confirmed',
          confirmation: {
            at: iso(at),
            by: user.id,
            method: caregiver ? 'caregiver' : 'tap',
            verification: 'unverified',
          },
        },
      );
      if (!updated) {
        // Someone else changed it between our read and write: report the truth, never double-confirm.
        const cur = await store.getOccurrence(o.id);
        if (cur?.status === 'confirmed')
          return { occurrence: view(cur, at), alreadyConfirmed: true };
        throw new HttpError(409, 'changed');
      }
      return { occurrence: view(updated, at), alreadyConfirmed: false };
    },

    // ---- patient only ----------------------------------------------------------------------
    async snooze(user: AuthUser, id: string) {
      requireRole(user, 'patient');
      const o = await ownOccurrence(user, id);
      const at = now().getTime();
      if (o.status !== 'pending') throw new HttpError(409, o.status);
      if (at >= escalateMs(o)) throw new HttpError(409, 'overdue');
      if (at < dueMs(o)) throw new HttpError(409, 'not_due');
      if (o.snoozeCount >= MAX_SNOOZES) throw new HttpError(409, 'snooze_limit');
      const updated = await store.updateOccurrenceIf(
        o.id,
        { status: ['pending'], snoozeCount: o.snoozeCount },
        {
          snoozeCount: o.snoozeCount + 1,
          snoozedUntil: iso(at + SNOOZE_MIN * MIN),
          nudges: 0, // prompt again when the snooze ends
        },
      );
      if (!updated) throw new HttpError(409, 'changed');
      return view(updated, at);
    },

    // ---- pill check (photos) ---------------------------------------------------------------
    /**
     * Patient sends a few photos AFTER tapping "I took it". The tap stays the source of truth: this only sets
     * a verification label, and any failure (bad model output, outage) means "needs caregiver review", never
     * a missed alert and never a blocked patient. The patient always gets the same answer (no "rejected").
     */
    async submitPillCheck(user: AuthUser, id: string, frames: VisionFrame[]) {
      requireRole(user, 'patient');
      const o = await ownOccurrence(user, id);
      if (o.kind !== 'pill') throw new HttpError(409, 'not_a_pill');
      if (o.status !== 'confirmed' || !o.confirmation) throw new HttpError(409, 'not_confirmed');
      if (o.confirmation.method === 'caregiver') throw new HttpError(409, 'not_applicable');
      if (o.confirmation.verification !== 'unverified') throw new HttpError(409, 'already_checked');
      // The declared type can lie: check the real bytes of every frame.
      for (const f of frames)
        if (sniffFrameType(f.data) !== f.mediaType) throw new HttpError(400, 'bad_image');

      let verification: Verification;
      try {
        const r = await vision().assessPillTaken(frames);
        verification =
          r.confidence < LOW_CONFIDENCE
            ? 'pending_review'
            : r.verdict === 'taken'
              ? 'verified'
              : r.verdict === 'not_taken'
                ? 'rejected'
                : 'pending_review';
      } catch (err) {
        logger.error('pill check failed', { occurrence: o.id, err: String(err) }); // no frames/PII in logs
        verification = 'pending_review';
      }

      const updated = await store.updateOccurrenceIf(
        o.id,
        { status: ['confirmed'], verification: ['unverified'] }, // only the first submission counts
        { confirmation: { ...o.confirmation, method: 'video', verification } },
      );
      if (!updated) throw new HttpError(409, 'already_checked');
      if (verification !== 'verified') {
        // Photos are kept ONLY when a human has to look at them.
        const createdAt = iso(now().getTime());
        await store.putFrames(
          frames.map((f, i): Frame => ({
            id: `${o.id}#${i}`,
            occurrenceId: o.id,
            patientId: o.patientId,
            mediaType: f.mediaType,
            data: f.data,
            createdAt,
          })),
        );
        await bus.emit('caregiver.alert', {
          patientId: o.patientId,
          source: 'reminders',
          severity: 'warning',
          reasonCode: 'pill_check_review',
        });
      }
      return { received: true }; // identical for every outcome
    },

    /** Caregiver looks at the photos. Every view is written to the audit log. */
    async getFrames(user: AuthUser, id: string) {
      requireRole(user, 'primary_caregiver');
      const o = await ownOccurrence(user, id);
      const frames = await store.getFrames(o.id);
      if (!frames.length) throw new HttpError(404, 'no_frames');
      await store.addAudit({
        id: crypto.randomUUID(),
        at: iso(now().getTime()),
        actorId: user.id,
        patientId: o.patientId,
        action: 'pill_frames_viewed',
        occurrenceId: o.id,
      });
      // Served only to the authenticated caregiver through the API: there is no public URL to leak.
      return { frames: frames.map((f) => ({ mediaType: f.mediaType, data: f.data })) };
    },

    async reviewCheck(user: AuthUser, id: string, decision: 'approve' | 'reject') {
      requireRole(user, 'primary_caregiver');
      const o = await ownOccurrence(user, id);
      const at = now().getTime();
      if (!o.confirmation) throw new HttpError(409, 'not_confirmed');
      const next: Verification = decision === 'approve' ? 'verified' : 'rejected';
      const updated = await store.updateOccurrenceIf(
        o.id,
        { status: ['confirmed'], verification: ['pending_review', 'rejected'] },
        {
          confirmation: {
            ...o.confirmation,
            verification: next,
            reviewedBy: user.id,
            reviewedAt: iso(at),
          },
        },
      );
      if (!updated) throw new HttpError(409, 'nothing_to_review');
      if (decision === 'approve') await store.deleteFrames(o.id); // reviewed and fine: don't keep the photos
      await store.addAudit({
        id: crypto.randomUUID(),
        at: iso(at),
        actorId: user.id,
        patientId: o.patientId,
        action: 'pill_check_reviewed',
        occurrenceId: o.id,
      });
      return view(updated, at);
    },

    /** `byYou` lets the dashboard show only what another caregiver did (the full record still lists everything). */
    async audit(user: AuthUser) {
      requireRole(user, 'primary_caregiver');
      const rows = await store.listAudit(patientOf(user), 50);
      return rows.map((a) => ({ ...a, byYou: a.actorId === user.id }));
    },

    /** Job: delete photos past the retention window. Returns how many were removed. */
    async cleanupFrames(): Promise<number> {
      return store.deleteFramesOlderThan(iso(now().getTime() - FRAME_RETENTION_DAYS * 86_400_000));
    },

    /**
     * The clock. Idempotent and safe to run from several processes: every state change is a compare-and-set,
     * and a push/alert goes out ONLY when this call actually made the change. Call it from a job; it must NOT
     * run from request handlers.
     */
    async sweep(): Promise<{ nudged: number; escalated: number }> {
      const at = now();
      const t = at.getTime();
      const stats = { nudged: 0, escalated: 0 };
      const schedules = await store.allSchedules();
      await ensureToday(schedules, at);
      const byId = new Map(schedules.map((s) => [s.id, s]));

      for (const o of await store.pendingOccurrences()) {
        const s = byId.get(o.scheduleId);
        if (!s || s.paused) continue; // paused (asleep / in hospital): no prompts, no alerts

        if (t >= escalateMs(o)) {
          const missed = await store.updateOccurrenceIf(
            o.id,
            { status: ['pending'] },
            { status: 'missed', missedAt: iso(t) },
          );
          if (missed && s.escalate) {
            await bus.emit('caregiver.alert', {
              patientId: o.patientId,
              source: 'reminders',
              severity: o.kind === 'pill' ? 'urgent' : 'warning',
              reasonCode: 'reminder_missed',
            });
            stats.escalated++;
          }
          continue;
        }
        if (o.kind === 'pill' && (await recentPillConfirmation(o.patientId, o.id, t))) {
          // another pill was just confirmed: never prompt a second dose
          await store.updateOccurrenceIf(o.id, { status: ['pending'] }, { status: 'skipped' });
          continue;
        }
        const effective = effectiveMs(o);
        const due1 = t >= effective && o.nudges === 0;
        const due2 = t >= effective + PROMPT_AGAIN_MIN * MIN && o.nudges === 1;
        if (due1 || due2) {
          // record first (compare-and-set on the nudge count): a crash or a second sweeper can't re-send
          const nudged = await store.updateOccurrenceIf(
            o.id,
            { status: ['pending'], nudges: o.nudges },
            { nudges: o.nudges + 1 },
          );
          if (!nudged) continue;
          await notifier().push(o.patientId, {
            title: 'Reminder',
            body: PLAIN[o.kind],
            data: { occurrenceId: o.id },
          });
          stats.nudged++;
        }
      }
      return stats;
    },
  };
}

export type ReminderService = ReturnType<typeof createReminderService>;
