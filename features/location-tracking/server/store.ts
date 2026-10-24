import type { LocationReading } from '@contracts/location';

/** A reading as stored. `stale` is derived at read time, never stored. */
export type StoredReading = Omit<LocationReading, 'stale'>;

export interface ViewAuditEntry {
  id: string;
  patientId: string;
  requesterId: string;
  purpose: string;
  outcome: 'served' | 'no_data' | 'denied';
  at: string; // ISO-8601 UTC. No coordinates, ever.
}

/** Storage port. Supabase adapter replaces the in-memory one; the tables are in migrations/. */
export interface LocationStore {
  /** Keeps the reading only if it is newer than the current one (offline flushes arrive out of order). */
  saveIfNewer(patientId: string, reading: StoredReading): boolean;
  getLatest(patientId: string): StoredReading | null;
  appendAudit(entry: ViewAuditEntry): void; // idempotent by id
  listAudit(patientId: string, limit: number): ViewAuditEntry[]; // newest first
}

export function createMemoryStore(): LocationStore {
  const latest = new Map<string, StoredReading>();
  const audit = new Map<string, ViewAuditEntry>();
  return {
    saveIfNewer(patientId, reading) {
      const cur = latest.get(patientId);
      if (cur && Date.parse(cur.recordedAt) >= Date.parse(reading.recordedAt)) return false;
      latest.set(patientId, reading);
      return true;
    },
    getLatest: (patientId) => latest.get(patientId) ?? null,
    appendAudit(entry) {
      audit.set(entry.id, entry);
    },
    listAudit: (patientId, limit) =>
      [...audit.values()]
        .filter((a) => a.patientId === patientId)
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, limit),
  };
}
