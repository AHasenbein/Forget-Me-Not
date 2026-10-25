import type { BillReading } from '@core/ai/documents';
import { MIN_CONFIDENCE } from './constants';
import type { Outcome } from './schemas';

/**
 * The model's company name is untrusted text that ends up on a screen. Keep it short and plain: drop anything that
 * looks like a link, an email, a phone number or an instruction, and anything but ordinary name characters.
 */
export function cleanPayee(raw: string): string {
  const s = raw
    .normalize('NFKC')
    .replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, ' ')
    .replace(/[^\p{L}\p{N} &.,'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  return /\b(ignore|instruction|approve|mark|safe|system|prompt)\b/i.test(s) ? '' : s;
}

/** Whole days from `todayIso` to `dueDate` (both YYYY-MM-DD, UTC days). Negative = overdue. null if unusable. */
export function dueInDays(dueDate: string | null, todayIso: string): number | null {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return null;
  return Math.round((due - today) / 86_400_000);
}

/** A due date that is not a real calendar day (e.g. 2026-02-31) is thrown away rather than shown. */
export const validDate = (d: string | null): string | null =>
  d &&
  !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)
    ? d
    : null;

export interface Described {
  outcome: Outcome;
  utility: BillReading['utility'];
  payee: string;
  amountCents: number | null;
  dueDate: string | null;
  redFlags: BillReading['redFlags'];
  confidence: number;
}

/**
 * Turns a (strictly parsed, still untrusted) reading into what the app may show. Not a bill, or a low-confidence
 * reading, means "could not read": no guessed amount or date ever reaches the patient. Warning signs mean "flagged".
 */
export function describe(reading: BillReading): Described {
  const unreadable = !reading.isBill || reading.confidence < MIN_CONFIDENCE;
  if (unreadable)
    return {
      outcome: 'unclear',
      utility: 'other',
      payee: '',
      amountCents: null,
      dueDate: null,
      redFlags: [],
      confidence: reading.confidence,
    };
  return {
    outcome: reading.redFlags.length > 0 ? 'flagged' : 'read',
    utility: reading.utility,
    payee: cleanPayee(reading.payee),
    amountCents: reading.amountCents,
    dueDate: validDate(reading.dueDate),
    redFlags: [...new Set(reading.redFlags)],
    confidence: reading.confidence,
  };
}
