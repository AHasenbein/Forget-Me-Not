import { z } from 'zod';
import type { VisionFrame } from './vision';

/**
 * Documents port: "what is this bill?". Model output is UNTRUSTED: it is parsed against a strict schema and may only
 * ever fill in a description (never trigger an action). Anything unparseable is thrown away by the adapter.
 */
export const UTILITIES = [
  'electric',
  'water',
  'gas',
  'phone',
  'internet',
  'insurance',
  'rent',
  'medical',
  'tax',
  'credit_card',
  'other',
] as const;
export type Utility = (typeof UTILITIES)[number];

/** Warning signs a scam bill often shows. The patient is told not to pay and to show their caregiver. */
export const RED_FLAGS = ['gift_cards', 'threat', 'pay_by_phone', 'final_notice'] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export const billReadingSchema = z
  .object({
    isBill: z.boolean(),
    utility: z.enum(UTILITIES),
    payee: z.string().max(80),
    amountCents: z.number().int().min(0).max(100_000_000).nullable(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    redFlags: z.array(z.enum(RED_FLAGS)).max(4),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type BillReading = z.infer<typeof billReadingSchema>;

/** What the adapter returns when it could not read the picture at all. Never a guess. */
export const UNREADABLE: BillReading = {
  isBill: false,
  utility: 'other',
  payee: '',
  amountCents: null,
  dueDate: null,
  redFlags: [],
  confidence: 0,
};

export interface DocumentReader {
  readBill(frames: readonly VisionFrame[]): Promise<BillReading>;
}
