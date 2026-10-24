import type { Alert } from './schemas';

/** Storage port. Only the in-memory (demo) implementation exists; a Supabase one is the next step. */
export interface AlertStore {
  get(id: string): Alert | undefined;
  /** The patient's open alert (active or acknowledged), if any. */
  getOpen(patientId: string): Alert | undefined;
  /** Every alert still waiting on an acknowledgement, for the sweep. */
  allActive(): Alert[];
  put(a: Alert): void;
}

export class MemoryAlertStore implements AlertStore {
  private alerts = new Map<string, Alert>();

  get = (id: string) => this.alerts.get(id);
  getOpen = (patientId: string) =>
    [...this.alerts.values()].find(
      (a) => a.patientId === patientId && (a.status === 'active' || a.status === 'acknowledged'),
    );
  allActive = () => [...this.alerts.values()].filter((a) => a.status === 'active');
  put = (a: Alert) => void this.alerts.set(a.id, structuredClone(a));
}
