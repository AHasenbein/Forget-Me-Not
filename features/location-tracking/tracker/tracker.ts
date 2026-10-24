import { REPORT_INTERVAL_MS } from '../constants';
import { dropBatch, enqueue, nextBatch } from './queue';
import type { Fix, QueueStorage, Reading, TrackerStatus, UploadResult, Uploader } from './types';

export interface TrackerDeps {
  uploader: Uploader;
  storage: QueueStorage;
  now: () => Date;
  intervalMs?: number;
}

const MAX_ACCURACY_M = 10_000; // matches the server schema; unknown accuracy is reported as worst-case

export function toReading(fix: Fix, nowMs: number): Reading | null {
  const ok =
    Number.isFinite(fix.lat) &&
    Number.isFinite(fix.lng) &&
    Number.isFinite(fix.timestampMs) &&
    Math.abs(fix.lat) <= 90 &&
    Math.abs(fix.lng) <= 180;
  if (!ok) return null;
  // A wrong device clock must not make the server reject the reading: clamp to "now".
  return {
    lat: fix.lat,
    lng: fix.lng,
    accuracyM:
      fix.accuracyM !== null && fix.accuracyM >= 0
        ? Math.min(fix.accuracyM, MAX_ACCURACY_M)
        : MAX_ACCURACY_M,
    recordedAt: new Date(Math.min(fix.timestampMs, nowMs)).toISOString(),
    source: 'gps',
  };
}

/**
 * Throttles OS location fixes to one report per interval (iOS cannot be told "every 5 minutes", so the cadence is
 * enforced here), keeps unsent readings across offline periods and restarts, and uploads them oldest first.
 * No coordinates are ever logged.
 */
export function createTracker({
  uploader,
  storage,
  now,
  intervalMs = REPORT_INTERVAL_MS,
}: TrackerDeps) {
  let queue: Reading[] = [];
  let lastRecordedMs: number | null = null;
  let status: TrackerStatus = 'idle';
  let loaded: Promise<void> | null = null;
  let inflight: Promise<void> | null = null;

  const persist = async () => {
    try {
      await storage.save(queue);
    } catch {
      // Storage trouble must never stop tracking; the in-memory queue still works.
    }
  };

  const load = () =>
    (loaded ??= storage.load().then(
      (saved) => {
        for (const r of saved) queue = enqueue(queue, r);
        const newest = queue.at(-1);
        if (newest) lastRecordedMs = Date.parse(newest.recordedAt);
      },
      () => undefined,
    ));

  const drain = async () => {
    while (queue.length) {
      const batch = nextBatch(queue);
      let result: UploadResult;
      try {
        result = await uploader.send(batch);
      } catch {
        result = 'retry';
      }
      if (result === 'ok' || result === 'rejected') {
        queue = dropBatch(queue, batch);
        status = 'ok';
        await persist();
      } else {
        status = result === 'unauthorized' ? 'signed_out' : 'offline';
        return;
      }
    }
  };

  /** Single-flight: repeated triggers (task + foreground timer) share one upload, never two. */
  const flush = async () => {
    await load();
    inflight ??= drain().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return {
    /** Feed every OS fix here. Returns true if it was queued (i.e. not throttled, invalid or mocked). */
    async onFix(fix: Fix): Promise<boolean> {
      await load();
      const reading = fix.mocked ? null : toReading(fix, now().getTime());
      const at = reading ? Date.parse(reading.recordedAt) : 0;
      const throttled = lastRecordedMs !== null && at - lastRecordedMs < intervalMs;
      const queued = Boolean(reading) && !throttled;
      if (reading && queued) {
        queue = enqueue(queue, reading);
        lastRecordedMs = at;
        await persist();
      }
      await flush(); // also retries anything left from an offline period
      return queued;
    },
    flush,
    getStatus: () => status,
    pending: () => queue.length,
  };
}

export type Tracker = ReturnType<typeof createTracker>;
