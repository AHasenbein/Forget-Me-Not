import { z } from 'zod';

/**
 * Vision port: "does this short series of photos show the person taking their pill?".
 * Model output is UNTRUSTED: it is parsed against a strict schema and may only ever set a
 * verification label (never trigger an action). Anything unparseable becomes "needs caregiver review".
 */
export const FRAME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FrameType = (typeof FRAME_TYPES)[number];

export interface VisionFrame {
  mediaType: FrameType;
  /** base64, no data: prefix */
  data: string;
}

export const visionResultSchema = z
  .object({
    verdict: z.enum(['taken', 'not_taken', 'unclear']),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type VisionResult = z.infer<typeof visionResultSchema>;

export interface VisionClient {
  assessPillTaken(frames: readonly VisionFrame[]): Promise<VisionResult>;
}

/** Checks the real file type from the first bytes (the declared type can lie). */
export function sniffFrameType(base64: string): FrameType | null {
  let b: Buffer;
  try {
    b = Buffer.from(base64.slice(0, 64), 'base64');
  } catch {
    return null;
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}
