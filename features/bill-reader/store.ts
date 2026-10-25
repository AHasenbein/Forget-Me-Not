import { KEEP_SCANS } from './constants';
import type { Scan } from './schemas';

/** Storage port. Only the in-memory (demo) store exists; the table is in migrations/. Reads return copies. */
export interface ScanStore {
  add(scan: Scan): void;
  /** Newest first, at most `limit`. */
  list(patientId: string, limit: number): Scan[];
  countSince(patientId: string, sinceIso: string): number;
  clear(): void;
}

export class MemoryScanStore implements ScanStore {
  private scans = new Map<string, Scan[]>();
  private counts = new Map<string, string[]>(); // creation times, for the daily cap (kept beyond the 10 shown)

  add(scan: Scan) {
    const list = [structuredClone(scan), ...(this.scans.get(scan.patientId) ?? [])].slice(
      0,
      KEEP_SCANS,
    );
    this.scans.set(scan.patientId, list);
    this.counts.set(scan.patientId, [...(this.counts.get(scan.patientId) ?? []), scan.createdAt]);
  }
  list = (patientId: string, limit: number) =>
    (this.scans.get(patientId) ?? []).slice(0, limit).map((s) => structuredClone(s));
  countSince = (patientId: string, sinceIso: string) =>
    (this.counts.get(patientId) ?? []).filter((t) => t >= sinceIso).length;
  clear() {
    this.scans.clear();
    this.counts.clear();
  }
}
