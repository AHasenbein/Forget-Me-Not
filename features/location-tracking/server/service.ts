import type { z } from 'zod';
import type { AuthUser } from '@core/auth/types';
import type {
  GeofenceEvent,
  GeofenceSpec,
  LocationReadContract,
  LocationReading,
} from '@contracts/location';
import { FIND_SESSION_MS, MAX_FUTURE_SKEW_MS, STALE_AFTER_MS } from '../constants';
import type { readingSchema } from './schema';
import type { LocationStore, StoredReading } from './store';

/** Who may read this patient's location through the contract. Empty by default (fail closed). */
export type AccessCheck = (requesterId: string, patientId: string) => boolean | Promise<boolean>;

export interface ServiceDeps {
  store: LocationStore;
  now: () => Date;
  canRead: AccessCheck;
  newId?: () => string;
}

export type LocationService = ReturnType<typeof createLocationService>;

export function createLocationService({
  store,
  now,
  canRead,
  newId = () => crypto.randomUUID(),
}: ServiceDeps) {
  const toReading = (r: StoredReading): LocationReading => ({
    ...r,
    stale: now().getTime() - Date.parse(r.recordedAt) > STALE_AFTER_MS,
  });

  const audit = (
    patientId: string,
    requesterId: string,
    purpose: string,
    outcome: 'served' | 'no_data' | 'denied',
  ) =>
    store.appendAudit({
      id: newId(),
      patientId,
      requesterId,
      purpose,
      outcome,
      at: now().toISOString(),
    });

  /** Single read path for routes and the contract: authorise, read, audit. */
  const read = (
    patientId: string,
    requesterId: string,
    purpose: string,
    allowed: boolean,
  ): LocationReading | null => {
    if (!allowed) {
      audit(patientId, requesterId, purpose, 'denied');
      return null;
    }
    const latest = store.getLatest(patientId);
    audit(patientId, requesterId, purpose, latest ? 'served' : 'no_data');
    return latest ? toReading(latest) : null;
  };

  /** One active find session per patient, in memory (it lasts minutes; a restart simply ends it). */
  const finds = new Map<string, { by: string; expiresAt: number }>();
  const activeFind = (patientId: string) => {
    const f = finds.get(patientId);
    if (f && f.expiresAt > now().getTime()) return f;
    finds.delete(patientId);
    return null;
  };
  const findState = (patientId: string) => {
    const f = activeFind(patientId);
    return { active: Boolean(f), expiresAt: f ? new Date(f.expiresAt).toISOString() : null };
  };

  const geofences = new Map<string, GeofenceSpec>();
  const geofenceHandlers = new Set<(e: GeofenceEvent) => void>();

  const contract: LocationReadContract = {
    async getLastKnown(req) {
      const allowed = await canRead(req.requesterId, req.patientId);
      return read(req.patientId, req.requesterId, req.purpose, allowed);
    },
    // Native region monitoring and debouncing arrive in a later PR; this only remembers the specs.
    async registerGeofence(spec) {
      geofences.set(spec.id, spec);
    },
    async removeGeofence(id) {
      geofences.delete(id);
    },
    onGeofenceEvent(handler) {
      geofenceHandlers.add(handler);
      return () => geofenceHandlers.delete(handler);
    },
  };

  return {
    contract,

    /** Patient device reports. Scoped to the session's own patient; future-dated readings are dropped. */
    ingest(user: AuthUser, readings: z.infer<typeof readingSchema>[]) {
      if (user.role !== 'patient' || !user.patientId)
        return { accepted: 0, rejected: readings.length };
      const limit = now().getTime() + MAX_FUTURE_SKEW_MS;
      let accepted = 0;
      let rejected = 0;
      for (const r of readings) {
        if (Date.parse(r.recordedAt) > limit) {
          rejected++;
          continue;
        }
        store.saveIfNewer(user.patientId, r);
        accepted++;
      }
      return { accepted, rejected };
    },

    /**
     * Caregiver / granted circle member. Route access is already enforced by core; this re-checks the
     * link. Handlers cannot return 403, so an unlinked caller gets `{ location: null }` and no coordinates.
     */
    view(user: AuthUser): { location: LocationReading | null } {
      if (!user.patientId) return { location: null };
      const allowed =
        user.role === 'primary_caregiver' ||
        (user.role === 'circle_member' && user.grants.includes('view_location'));
      const purpose = user.role === 'primary_caregiver' ? 'caregiver_view' : 'circle_view';
      // The session start is audited once; its follow-up reads are not, or the "who looked" list would drown.
      if (allowed && activeFind(user.patientId)?.by === user.id) {
        const latest = store.getLatest(user.patientId);
        return { location: latest ? toReading(latest) : null };
      }
      return { location: read(user.patientId, user.id, purpose, allowed) };
    },

    /** Primary caregiver only. Starts (or returns) a time-limited precise session; audited; the patient is told. */
    startFind(user: AuthUser) {
      if (user.role !== 'primary_caregiver' || !user.patientId)
        return { active: false, expiresAt: null };
      if (!activeFind(user.patientId)) {
        finds.set(user.patientId, { by: user.id, expiresAt: now().getTime() + FIND_SESSION_MS });
        audit(user.patientId, user.id, 'find_session', 'served');
      }
      return findState(user.patientId);
    },

    /** Caregiver or the patient themself can end it at once; the patient always has the last word. */
    stopFind(user: AuthUser) {
      if (!user.patientId || (user.role !== 'primary_caregiver' && user.role !== 'patient'))
        return { active: false, expiresAt: null };
      finds.delete(user.patientId);
      return findState(user.patientId);
    },

    /** Patient device: should I be reporting precisely right now (and tell the patient)? Caregiver: is it still on? */
    findStatus(user: AuthUser) {
      if (!user.patientId || (user.role !== 'patient' && user.role !== 'primary_caregiver'))
        return { active: false, expiresAt: null };
      return findState(user.patientId);
    },

    /** Primary caregiver only: who looked at the location, and when. `byYou` lets the UI leave out your own looks. */
    views(user: AuthUser, limit = 100) {
      if (user.role !== 'primary_caregiver' || !user.patientId) return { views: [] };
      const rows = store.listAudit(user.patientId, limit);
      return { views: rows.map((v) => ({ ...v, byYou: v.requesterId === user.id })) };
    },
  };
}
