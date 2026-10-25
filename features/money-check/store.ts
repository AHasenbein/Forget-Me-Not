import type { AuditEntry, MoneyRequest } from './schemas';

/** Storage port. Only the in-memory (demo) implementation exists; a Supabase one is the next step. */
export interface RequestStore {
  get(id: string): MoneyRequest | undefined;
  getOpen(patientId: string): MoneyRequest | undefined;
  allPending(): MoneyRequest[];
  /** The patient's most recently decided request. */
  latestDecided(patientId: string): MoneyRequest | undefined;
  countSince(patientId: string, sinceIso: string): number;
  /** Requests auto-cleared since `sinceIso`, newest first (so the caregiver can see what the AI let through). */
  clearedSince(patientId: string, sinceIso: string): MoneyRequest[];
  put(r: MoneyRequest): void;
  addAudit(e: AuditEntry & { patientId: string }): void;
  audit(patientId: string): AuditEntry[];
  clear(): void;
}

/** Reads return copies, so a caller can only change data through `put`. */
const clone = (r: MoneyRequest | undefined) => (r ? structuredClone(r) : undefined);

export class MemoryRequestStore implements RequestStore {
  private requests = new Map<string, MoneyRequest>();
  private log: (AuditEntry & { patientId: string })[] = [];

  get = (id: string) => clone(this.requests.get(id));
  getOpen = (patientId: string) =>
    clone(
      [...this.requests.values()].find((r) => r.patientId === patientId && r.status === 'pending'),
    );
  allPending = () =>
    [...this.requests.values()]
      .filter((r) => r.status === 'pending')
      .map((r) => structuredClone(r));
  latestDecided = (patientId: string) =>
    clone(
      [...this.requests.values()]
        .filter((r) => r.patientId === patientId && r.status !== 'pending')
        .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))[0],
    );
  countSince = (patientId: string, sinceIso: string) =>
    [...this.requests.values()].filter((r) => r.patientId === patientId && r.createdAt >= sinceIso)
      .length;
  clearedSince = (patientId: string, sinceIso: string) =>
    [...this.requests.values()]
      .filter((r) => r.patientId === patientId && r.status === 'cleared' && r.createdAt >= sinceIso)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => structuredClone(r));
  put = (r: MoneyRequest) => void this.requests.set(r.id, structuredClone(r));
  addAudit = (e: AuditEntry & { patientId: string }) => void this.log.push({ ...e });
  audit = (patientId: string) =>
    this.log
      .filter((e) => e.patientId === patientId)
      .map(({ patientId: _p, ...e }) => e)
      .reverse();
  clear() {
    this.requests.clear();
    this.log = [];
  }
}
