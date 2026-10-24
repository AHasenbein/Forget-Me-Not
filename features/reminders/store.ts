import type { Occurrence, Schedule } from './schemas';

/** Storage port. Only the in-memory (demo) implementation exists; a Supabase one is the next step. */
export interface ReminderStore {
  listSchedules(patientId: string): Schedule[];
  allSchedules(): Schedule[];
  getSchedule(id: string): Schedule | undefined;
  putSchedule(s: Schedule): void;
  deleteSchedule(id: string): void;
  listOccurrences(patientId: string): Occurrence[];
  pendingOccurrences(): Occurrence[];
  getOccurrence(id: string): Occurrence | undefined;
  putOccurrence(o: Occurrence): void;
  deleteOccurrence(id: string): void;
}

export class MemoryStore implements ReminderStore {
  private schedules = new Map<string, Schedule>();
  private occurrences = new Map<string, Occurrence>();

  listSchedules = (patientId: string) =>
    [...this.schedules.values()].filter((s) => s.patientId === patientId);
  allSchedules = () => [...this.schedules.values()];
  getSchedule = (id: string) => this.schedules.get(id);
  putSchedule = (s: Schedule) => void this.schedules.set(s.id, structuredClone(s));
  deleteSchedule = (id: string) => void this.schedules.delete(id);
  listOccurrences = (patientId: string) =>
    [...this.occurrences.values()].filter((o) => o.patientId === patientId);
  pendingOccurrences = () => [...this.occurrences.values()].filter((o) => o.status === 'pending');
  getOccurrence = (id: string) => this.occurrences.get(id);
  putOccurrence = (o: Occurrence) => void this.occurrences.set(o.id, structuredClone(o));
  deleteOccurrence = (id: string) => void this.occurrences.delete(id);
}
