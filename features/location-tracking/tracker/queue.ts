import { MAX_BATCH } from '../constants';
import type { Reading } from './types';

/** About 24 hours of readings at one per 5 minutes. Older ones are dropped first: the newest matters most. */
export const MAX_QUEUE = 288;

/** Pure offline queue: ascending by time, de-duplicated by timestamp, bounded. */
export function enqueue(queue: readonly Reading[], r: Reading): Reading[] {
  if (queue.some((q) => q.recordedAt === r.recordedAt)) return [...queue];
  const next = [...queue, r].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return next.slice(-MAX_QUEUE);
}

/** Oldest first, but never more than the server accepts in one request. */
export const nextBatch = (queue: readonly Reading[]): Reading[] => queue.slice(0, MAX_BATCH);

export const dropBatch = (queue: readonly Reading[], sent: readonly Reading[]): Reading[] =>
  queue.filter((q) => !sent.some((s) => s.recordedAt === q.recordedAt));
