import { z } from 'zod';
import { MAX_BATCH } from '../constants';

export const readingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(10_000),
  recordedAt: z.iso.datetime(),
  source: z.enum(['gps', 'network', 'manual']),
});

/** Body of POST /readings. A `patientId` here is stripped by zod: identity comes from the session. */
export const ingestSchema = z.object({ readings: z.array(readingSchema).min(1).max(MAX_BATCH) });

/** Body of POST /find and /find/stop: nothing to send. Identity and patient come from the session. */
export const emptySchema = z.object({});
