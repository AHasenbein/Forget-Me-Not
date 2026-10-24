import type {
  AuditEntry,
  Frame,
  Occurrence,
  OccurrenceStatus,
  Schedule,
  Verification,
} from './schemas';

/** Conditions an update must still satisfy (compare-and-set), so two processes can't both act on one occurrence. */
export interface OccurrenceExpect {
  status?: readonly OccurrenceStatus[];
  nudges?: number;
  snoozeCount?: number;
  /** Only matches confirmed occurrences whose confirmation.verification is one of these. */
  verification?: readonly Verification[];
}

/**
 * Storage port (async: the live implementation is Postgres). State changes go through `updateOccurrenceIf`,
 * which applies the patch only if the row still matches `expect` and returns the updated row, or null when
 * someone else got there first. Callers emit alerts / send pushes ONLY when it returns a row.
 */
export interface ReminderStore {
  listSchedules(patientId: string): Promise<Schedule[]>;
  allSchedules(): Promise<Schedule[]>;
  getSchedule(id: string): Promise<Schedule | undefined>;
  putSchedule(s: Schedule): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  listOccurrences(patientId: string): Promise<Occurrence[]>;
  pendingOccurrences(): Promise<Occurrence[]>;
  getOccurrence(id: string): Promise<Occurrence | undefined>;
  /** INSERT ... ON CONFLICT DO NOTHING. Returns true if it inserted. */
  insertOccurrenceIfAbsent(o: Occurrence): Promise<boolean>;
  updateOccurrenceIf(
    id: string,
    expect: OccurrenceExpect,
    patch: Partial<Occurrence>,
  ): Promise<Occurrence | null>;
  deleteOccurrence(id: string): Promise<void>;
  putFrames(frames: Frame[]): Promise<void>;
  getFrames(occurrenceId: string): Promise<Frame[]>;
  deleteFrames(occurrenceId: string): Promise<void>;
  /** Returns how many were deleted. */
  deleteFramesOlderThan(iso: string): Promise<number>;
  addAudit(entry: AuditEntry): Promise<void>;
  listAudit(patientId: string, limit: number): Promise<AuditEntry[]>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryStore implements ReminderStore {
  private schedules = new Map<string, Schedule>();
  private occurrences = new Map<string, Occurrence>();
  private frames: Frame[] = [];
  private audit: AuditEntry[] = [];

  listSchedules = async (patientId: string) =>
    [...this.schedules.values()].filter((s) => s.patientId === patientId).map(clone);
  allSchedules = async () => [...this.schedules.values()].map(clone);
  getSchedule = async (id: string) => {
    const s = this.schedules.get(id);
    return s && clone(s);
  };
  putSchedule = async (s: Schedule) => void this.schedules.set(s.id, clone(s));
  deleteSchedule = async (id: string) => void this.schedules.delete(id);
  listOccurrences = async (patientId: string) =>
    [...this.occurrences.values()].filter((o) => o.patientId === patientId).map(clone);
  pendingOccurrences = async () =>
    [...this.occurrences.values()].filter((o) => o.status === 'pending').map(clone);
  getOccurrence = async (id: string) => {
    const o = this.occurrences.get(id);
    return o && clone(o);
  };
  insertOccurrenceIfAbsent = async (o: Occurrence) => {
    if (this.occurrences.has(o.id)) return false;
    this.occurrences.set(o.id, clone(o));
    return true;
  };
  updateOccurrenceIf = async (id: string, expect: OccurrenceExpect, patch: Partial<Occurrence>) => {
    const cur = this.occurrences.get(id);
    if (!cur) return null;
    if (expect.status && !expect.status.includes(cur.status)) return null;
    if (expect.nudges !== undefined && cur.nudges !== expect.nudges) return null;
    if (expect.snoozeCount !== undefined && cur.snoozeCount !== expect.snoozeCount) return null;
    if (
      expect.verification &&
      !(cur.confirmation && expect.verification.includes(cur.confirmation.verification))
    )
      return null;
    const next = { ...cur, ...patch };
    this.occurrences.set(id, next);
    return clone(next);
  };
  deleteOccurrence = async (id: string) => void this.occurrences.delete(id);

  putFrames = async (frames: Frame[]) => void this.frames.push(...frames.map(clone));
  getFrames = async (occurrenceId: string) =>
    this.frames.filter((f) => f.occurrenceId === occurrenceId).map(clone);
  deleteFrames = async (occurrenceId: string) => {
    this.frames = this.frames.filter((f) => f.occurrenceId !== occurrenceId);
  };
  deleteFramesOlderThan = async (iso: string) => {
    const before = this.frames.length;
    this.frames = this.frames.filter((f) => f.createdAt >= iso);
    return before - this.frames.length;
  };
  addAudit = async (e: AuditEntry) => void this.audit.push(clone(e));
  listAudit = async (patientId: string, limit: number) =>
    this.audit
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map(clone);
}
