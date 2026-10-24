import type { z } from 'zod';
import type { AuthUser } from '@core/auth/types';
import type {
  GeofenceEvent,
  GeofenceSpec,
  LocationReadContract,
  LocationReading,
} from '@contracts/location';
import { MAX_FUTURE_SKEW_MS, STALE_AFTER_MS } from '../constants';
import type { readingSchema } from './schema';
import type { LocationStore, StoredReading } from './store';

/** Who may read this patient's location through the contract. Empty by default (fail closed). */
export type AccessCheck = (requesterId: string, patientId: string) => boolean;

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

  const geofences = new Map<string, GeofenceSpec>();
  const geofenceHandlers = new Set<(e: GeofenceEvent) => void>();

  const contract: LocationReadContract = {
    async getLastKnown(req) {
      return read(
        req.patientId,
        req.requesterId,
        req.purpose,
        canRead(req.requesterId, req.patientId),
      );
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
      return { location: read(user.patientId, user.id, purpose, allowed) };
    },

    /** Primary caregiver only: who looked at the location, and when. */
    views(user: AuthUser, limit = 100) {
      if (user.role !== 'primary_caregiver' || !user.patientId) return { views: [] };
      return { views: store.listAudit(user.patientId, limit) };
    },
  };
}
