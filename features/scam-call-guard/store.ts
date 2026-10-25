import type { Call, ViewEntry } from './schemas';

/** Storage port. Only the in-memory (demo) implementation exists; a Supabase one is the next step. */
export interface CallStore {
  get(id: string): Call | undefined;
  /** The patient's active call, if any. */
  getOpen(patientId: string): Call | undefined;
  all(): Call[];
  listByPatient(patientId: string, limit: number): Call[];
  put(c: Call): void;
  appendView(v: ViewEntry): void;
  listViews(patientId: string, limit: number): ViewEntry[];
}

export class MemoryCallStore implements CallStore {
  private calls = new Map<string, Call>();
  private views: ViewEntry[] = [];

  get = (id: string) => this.calls.get(id);
  getOpen = (patientId: string) =>
    [...this.calls.values()].find((c) => c.patientId === patientId && c.status === 'active');
  all = () => [...this.calls.values()];
  listByPatient = (patientId: string, limit: number) =>
    [...this.calls.values()]
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  put = (c: Call) => void this.calls.set(c.id, structuredClone(c));
  appendView = (v: ViewEntry) => void this.views.push({ ...v });
  listViews = (patientId: string, limit: number) =>
    this.views
      .filter((v) => v.patientId === patientId)
      .slice(-limit)
      .reverse();
}
