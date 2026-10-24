import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { HttpError } from '@core/server/errors';
import type { LocationReadContract, LocationReading } from '@contracts/location';
import { ALERT_TTL_MS, repeatDelayMs } from './constants';
import type { Alert, PatientStatus } from './schemas';
import type { AlertStore } from './store';

export interface LostButtonDeps {
  store: AlertStore;
  bus: EventBus;
  notifier: () => Notifier; // lazy: resolved only when a push is actually sent
  location: () => LocationReadContract;
  /** Current primary caregiver(s) of a patient. Called on EVERY attempt so unlinked caregivers stop receiving. */
  caregiversOf: (patientId: string) => string[];
  now: () => Date;
}

// Generic on purpose: no name, place or coordinates in a push. The app fetches the details after opening.
const PUSH = { title: 'Help needed', body: 'Open Forget Me Not now.' };

export function createLostButtonService({
  store,
  bus,
  notifier,
  location,
  caregiversOf,
  now,
}: LostButtonDeps) {
  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };
  /** 404 (never 403) for another patient's alert: don't confirm that the id exists. */
  const ownAlert = (user: AuthUser, id: string) => {
    const a = store.get(id);
    if (!a || a.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return a;
  };

  const patientStatus = (a: Alert): PatientStatus =>
    a.status === 'acknowledged' ? 'on_the_way' : a.delivered ? 'notified' : 'no_one_reachable';

  /** One push attempt to every current caregiver. A failing push never throws: it is retried by the next sweep. */
  async function notify(a: Alert) {
    a.attempts += 1;
    a.lastAttemptAt = now().toISOString();
    store.put(a); // record first: a crash must not cause a re-send storm
    for (const caregiverId of caregiversOf(a.patientId)) {
      try {
        await notifier().push(caregiverId, { ...PUSH, data: { alertId: a.id } });
        a.delivered = true;
      } catch {
        // unreachable caregiver: stay silent here, the sweep tries again
      }
    }
    store.put(a);
  }

  return {
    /** The press. Idempotent while an alert is open; the first push happens here, not in a job. */
    async press(user: AuthUser) {
      requireRole(user, 'patient');
      const patientId = patientOf(user);
      const open = store.getOpen(patientId);
      if (open && now().getTime() - Date.parse(open.createdAt) < ALERT_TTL_MS)
        return { alert: patientView(open), alreadyActive: true };
      if (open) store.put({ ...open, status: 'expired' });

      // No await between the lookup above and this put: two quick taps cannot both create an alert.
      const a: Alert = {
        id: crypto.randomUUID(),
        patientId,
        createdAt: now().toISOString(),
        status: 'active',
        attempts: 0,
        lastAttemptAt: null,
        delivered: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
      };
      store.put(a);
      await bus.emit('caregiver.alert', {
        patientId,
        source: 'lost-button',
        severity: 'urgent',
        reasonCode: 'patient_lost',
      });
      await notify(a);
      return { alert: patientView(a), alreadyActive: false };
    },

    /** Patient: status only. Caregiver: the alert plus the last known location (null/stale never hides the alert). */
    async active(user: AuthUser) {
      requireRole(user, 'patient', 'primary_caregiver');
      const patientId = patientOf(user);
      const a = store.getOpen(patientId);
      if (user.role === 'patient') return { alert: a ? patientView(a) : null };
      if (!a) return { alert: null, location: null };
      let reading: LocationReading | null = null;
      try {
        reading = await location().getLastKnown({
          patientId,
          requesterId: user.id,
          purpose: 'lost_button',
        });
      } catch {
        // location unavailable: still show the alert
      }
      return { alert: a, location: reading };
    },

    acknowledge(user: AuthUser, id: string) {
      requireRole(user, 'primary_caregiver');
      const a = ownAlert(user, id);
      if (a.status === 'acknowledged') return a; // idempotent; the first acknowledger is kept
      if (a.status !== 'active') throw new HttpError(409, a.status);
      a.status = 'acknowledged';
      a.acknowledgedBy = user.id;
      a.acknowledgedAt = now().toISOString();
      store.put(a);
      return a;
    },

    resolve(user: AuthUser, id: string) {
      requireRole(user, 'primary_caregiver');
      const a = ownAlert(user, id);
      if (a.status === 'resolved') return a;
      if (a.status === 'expired') throw new HttpError(409, 'expired');
      a.status = 'resolved';
      a.resolvedBy = user.id;
      a.resolvedAt = now().toISOString();
      store.put(a);
      return a;
    },

    /**
     * The clock. Call about every minute from a job (NOT from request handlers). Repeats pushes to unacknowledged alerts
     * and closes old ones. Idempotent within a minute.
     */
    async sweep(): Promise<{ repeated: number; expired: number }> {
      const t = now().getTime();
      const stats = { repeated: 0, expired: 0 };
      for (const a of store.allActive()) {
        if (t - Date.parse(a.createdAt) >= ALERT_TTL_MS) {
          a.status = 'expired';
          store.put(a);
          stats.expired++;
        } else if (t - Date.parse(a.lastAttemptAt ?? a.createdAt) >= repeatDelayMs(a.attempts)) {
          await notify(a);
          stats.repeated++;
        }
      }
      return stats;
    },
  };

  function patientView(a: Alert) {
    return { id: a.id, status: patientStatus(a), since: a.createdAt };
  }
}

export type LostButtonService = ReturnType<typeof createLostButtonService>;
