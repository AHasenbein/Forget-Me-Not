import { createHash } from 'node:crypto';
import type { BillReading } from '@core/ai/documents';
import { setSampleReadings } from '../runtime';
import { SAMPLE_READINGS } from './fixtures';
import { SAMPLE_BILLS } from './samples';

/**
 * Registers the demo sample pictures (by hash) with their canned readings. Nothing else is seeded: a scan exists only
 * once the patient shows a bill. Idempotent.
 */
export function seedBillReader(): void {
  const entries: Record<string, BillReading> = {};
  for (const s of SAMPLE_BILLS) {
    const reading = SAMPLE_READINGS[s.id];
    if (reading) entries[createHash('sha256').update(s.data).digest('hex')] = reading;
  }
  setSampleReadings(entries);
}
