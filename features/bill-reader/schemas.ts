import { z } from 'zod';
import { FRAME_TYPES } from '@core/ai/vision';
import { MAX_IMAGE_B64, MAX_IMAGES } from './constants';

export type { RedFlag, Utility } from '@core/ai/documents';

/** One or two pictures of the same bill. Real JPEG/PNG/WebP only (the bytes are re-checked server-side). */
export const scanInput = z
  .object({
    frames: z
      .array(
        z
          .object({
            mediaType: z.enum(FRAME_TYPES),
            data: z
              .string()
              .min(16)
              .max(MAX_IMAGE_B64)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_IMAGES),
  })
  .strict();
export type ScanInput = z.infer<typeof scanInput>;

/** read = a clear bill. flagged = a bill with scam warning signs. unclear = could not read it (or not a bill). */
export type Outcome = 'read' | 'flagged' | 'unclear';
export type Source = 'ai' | 'sample';

/** What is kept: the facts only, never the picture. */
export interface Scan {
  id: string;
  patientId: string;
  createdAt: string;
  outcome: Outcome;
  utility: import('@core/ai/documents').Utility;
  payee: string;
  amountCents: number | null;
  dueDate: string | null; // YYYY-MM-DD
  redFlags: import('@core/ai/documents').RedFlag[];
  confidence: number;
  source: Source;
}
