import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { HttpError } from '@core/server/errors';
import type {
  CreateScheduleInput,
  Occurrence,
  PatchScheduleInput,
  ReminderKind,
  Schedule,
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

const MIN = 60_000;
const PLAIN: Record<ReminderKind, string> = {
  pill: 'Time to take your pill',
  brush_teeth: 'Time to brush your teeth',
  shower: 'Time for your shower',
  feed_pets: 'Time to feed your pets',
};

export interface ReminderDeps {
  store: ReminderStore;
  bus: EventBus;
  notifier: () => Notifier; // lazy: only sweeps need it
  now: () => Date;
}

export type Phase = 'upcoming' | 'due' | 'snoozed' | 'overdue' | 'confirmed' | 'missed' | 'skipped';

const iso = (ms: number) => new Date(ms).toISOString();
const dueMs = (o: Occurrence) => Date.parse(o.dueAt);
const escalateMs = (o: Occurrence) => dueMs(o) + (ESCALATE_MIN + o.snoozeCount * SNOOZE_MIN) * MIN;
const effectiveMs = (o: Occurrence) =>
  Math.max(dueMs(o), o.snoozedUntil ? Date.parse(o.snoozedUntil) : 0);

export function createReminderService({ store, bus, notifier, now }: ReminderDeps) {
  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };
  /** 404 (never 403) for another patient's data: don't confirm that the id exists. */
  const ownOccurrence = (user: AuthUser, id: string) => {
    const o = store.getOccurrence(id);
    if (!o || o.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return o;
  };
  const ownSchedule = (user: AuthUser, id: string) => {
    const s = store.getSchedule(id);
    if (!s || s.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return s;
  };

  const recentPillConfirmation = (patientId: string, exceptId: string, at: number) =>
    store
      .listOccurrences(patientId)
      .some(
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
  function ensureToday(schedules: Schedule[], at: Date) {
    for (const s of schedules) {
      if (s.paused) continue;
      const localDate = localDateOf(at, s.timeZone);
      if (!s.daysOfWeek.includes(weekdayOf(localDate))) continue;
      const id = `${s.id}:${localDate}`;
      if (store.getOccurrence(id)) continue;
      const due = localTimeToUtc(localDate, s.localTime, s.timeZone);
      if (due.getTime() < Date.parse(s.activeFrom)) continue;
      store.putOccurrence({
        id,
        scheduleId: s.id,
        patientId: s.patientId,
        kind: s.kind,
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
    createSchedule(user: AuthUser, input: CreateScheduleInput): Schedule {
      requireRole(user, 'primary_caregiver');
      const patientId = patientOf(user);
      if (store.listSchedules(patientId).length >= MAX_SCHEDULES)
        throw new HttpError(409, 'too_many');
      const s: Schedule = {
        id: crypto.randomUUID(),
        patientId,
        ...input,
        paused: false,
        createdBy: user.id,
        activeFrom: now().toISOString(),
      };
      store.putSchedule(s);
      return s;
    },

    updateSchedule(user: AuthUser, id: string, patch: PatchScheduleInput): Schedule {
      requireRole(user, 'primary_caregiver');
      const s = { ...ownSchedule(user, id), ...patch };
      if (patch.localTime || patch.timeZone || patch.daysOfWeek) {
        s.activeFrom = now().toISOString();
        // Today's not-yet-actioned occurrence is regenerated from the new time.
        for (const o of store.listOccurrences(s.patientId))
          if (o.scheduleId === s.id && o.status === 'pending' && o.nudges === 0)
            store.deleteOccurrence(o.id);
      }
      store.putSchedule(s);
      return s;
    },

    deleteSchedule(user: AuthUser, id: string): void {
      requireRole(user, 'primary_caregiver');
      const s = ownSchedule(user, id);
      for (const o of store.listOccurrences(s.patientId))
        if (o.scheduleId === s.id && o.status === 'pending') store.deleteOccurrence(o.id);
      store.deleteSchedule(s.id);
    },

    listSchedules(user: AuthUser): Schedule[] {
      requireRole(user, 'patient', 'primary_caregiver');
      return store.listSchedules(patientOf(user));
    },

    // ---- patient + caregiver ---------------------------------------------------------------
    today(user: AuthUser) {
      requireRole(user, 'patient', 'primary_caregiver');
      const patientId = patientOf(user);
      const at = now();
      ensureToday(store.listSchedules(patientId), at);
      return store
        .listOccurrences(patientId)
        .filter((o) => o.localDate === localDateOf(at, o.timeZone))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map((o) => view(o, at.getTime()));
    },

    /** One tap. Idempotent: a second tap returns the existing confirmation. */
    confirm(user: AuthUser, id: string) {
      requireRole(user, 'patient', 'primary_caregiver');
      const o = ownOccurrence(user, id);
      const at = now().getTime();
      if (o.status === 'confirmed') return { occurrence: view(o, at), alreadyConfirmed: true };
      if (o.status === 'skipped') throw new HttpError(409, 'skipped');
      const caregiver = user.role === 'primary_caregiver';
      if (o.status === 'missed' && o.kind === 'pill' && !caregiver)
        throw new HttpError(409, 'expired_ask_caregiver'); // the caregiver may already have given it
      if (!caregiver && at < dueMs(o) - EARLY_WINDOW_MIN * MIN)
        throw new HttpError(409, 'too_early');
      if (o.kind === 'pill' && recentPillConfirmation(o.patientId, o.id, at))
        throw new HttpError(409, 'too_soon');
      o.status = 'confirmed';
      o.confirmation = {
        at: iso(at),
        by: user.id,
        method: caregiver ? 'caregiver' : 'tap',
        verification: 'unverified',
      };
      store.putOccurrence(o);
      return { occurrence: view(o, at), alreadyConfirmed: false };
    },

    // ---- patient only ----------------------------------------------------------------------
    snooze(user: AuthUser, id: string) {
      requireRole(user, 'patient');
      const o = ownOccurrence(user, id);
      const at = now().getTime();
      if (o.status !== 'pending') throw new HttpError(409, o.status);
      if (at >= escalateMs(o)) throw new HttpError(409, 'overdue');
      if (at < dueMs(o)) throw new HttpError(409, 'not_due');
      if (o.snoozeCount >= MAX_SNOOZES) throw new HttpError(409, 'snooze_limit');
      o.snoozeCount += 1;
      o.snoozedUntil = iso(at + SNOOZE_MIN * MIN);
      o.nudges = 0; // prompt again when the snooze ends
      store.putOccurrence(o);
      return view(o, at);
    },

    /**
     * The clock. Idempotent: running it twice in the same minute does nothing new. Call it from a job
     * (every minute); it must NOT run from request handlers. Alerts fire once, on the state change.
     */
    async sweep(): Promise<{ nudged: number; escalated: number }> {
      const at = now();
      const t = at.getTime();
      const stats = { nudged: 0, escalated: 0 };
      const schedules = store.allSchedules();
      ensureToday(schedules, at);
      const byId = new Map(schedules.map((s) => [s.id, s]));

      for (const o of store.pendingOccurrences()) {
        const s = byId.get(o.scheduleId);
        if (!s || s.paused) continue; // paused (asleep / in hospital): no prompts, no alerts

        if (t >= escalateMs(o)) {
          o.status = 'missed';
          o.missedAt = iso(t);
          store.putOccurrence(o);
          if (s.escalate) {
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
        if (o.kind === 'pill' && recentPillConfirmation(o.patientId, o.id, t)) {
          o.status = 'skipped'; // another pill was just confirmed: never prompt a second dose
          store.putOccurrence(o);
          continue;
        }
        const effective = effectiveMs(o);
        const due1 = t >= effective && o.nudges === 0;
        const due2 = t >= effective + PROMPT_AGAIN_MIN * MIN && o.nudges === 1;
        if (due1 || due2) {
          o.nudges += 1;
          store.putOccurrence(o); // record first: a crash must not cause a re-send storm
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
