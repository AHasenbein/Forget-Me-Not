import type { BankTransaction } from '@core/providers/types';
import type { Kind, Level, Reason } from './schemas';

/** Above this a bill gets a closer look from the caregiver. */
export const LARGE_AMOUNT_CENTS = 20_000;

export interface Assessment {
  level: Level;
  reasons: Reason[];
  /** The unpaid bill this request is about, when kind is "bill". */
  bill: BankTransaction | null;
}

/** The next unpaid bill: earliest due date first (undated last). */
export function nextUnpaidBill(bills: readonly BankTransaction[]): BankTransaction | null {
  const open = bills.filter((b) => !b.paid);
  open.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return open[0] ?? null;
}

/**
 * The decision engine. Plain rules, no AI: the same input always gives the same answer, and a model can never talk
 * its way into "ok". Anything unfamiliar is at least "check"; the caregiver decides every request anyway.
 */
export function assess(kind: Kind, bills: readonly BankTransaction[]): Assessment {
  if (kind === 'gift_card') return { level: 'stop', reasons: ['gift_card_payment'], bill: null };
  if (kind === 'caller_wants_money')
    return { level: 'stop', reasons: ['caller_pressure'], bill: null };

  const bill = nextUnpaidBill(bills);
  if (!bill) return { level: 'check', reasons: ['no_matching_bill'], bill: null };
  if (bill.amountCents > LARGE_AMOUNT_CENTS)
    return { level: 'check', reasons: ['large_amount'], bill };
  return { level: 'ok', reasons: ['known_bill'], bill };
}
